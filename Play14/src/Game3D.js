import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import heroModelUrl from './assets/Model/Hero_02.glb';
import athleteModelUrl from './assets/Model/Athlete_05.glb';
import weapon1Url from './assets/Image/Weapon_1.webp';

export class Game3D {
    constructor(container, options = {}) {
        this.container = container;
        this.onHit = options.onHit || (() => {});
        this.onShoot = options.onShoot || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onSquadCountChange = options.onSquadCountChange || (() => {});
        this.onLevelComplete = options.onLevelComplete || (() => {});
        this.onCoinCollect = options.onCoinCollect || (() => {});
        this.onPowerUp = options.onPowerUp || (() => {});

        this.width = container.clientWidth || window.innerWidth;
        this.height = container.clientHeight || window.innerHeight;

        this.isGameActive = false;
        this.isLevelFinished = false;

        // Player starts on Right lane (x = -1.0, visually right)
        this.playerX = -1.0;
        this.targetPlayerX = -1.0;
        this.minPlayerX = -2.40; // Safe clearance inside right railing (avoids arm clipping)
        this.maxPlayerX = 3.10;  // Safe clearance inside left railing (avoids arm clipping)
        this.playerZ = 4.5;     // Positioned closer forward in camera view

        // Track movement
        this.distanceTravelled = 0;
        this.worldSpeed = 5.2; // Slower enemy movement
        this.totalTrackLength = 180;

        // Left lane gate blocking mechanic
        this.isBox23Destroyed = false; // Box 3 stays stationary blocking left gates
        this.leftGatesDistance = 0;    // Left gates only start moving when Box 3 is destroyed!
        this.leftGatesSpeed = 13.5;    // High speed for fast booster gate rush!

        // Weapon assets
        const texLoader = new THREE.TextureLoader();
        this.weapon1Texture = texLoader.load(weapon1Url);

        // Shooting stats
        this.fireTimer = 0;
        this.fireInterval = 0.28; // Slower initial fire rate before getting the gun
        this.bulletPower = 1;
        this.bulletColor = 0x38bdf8; // Starts as cyan/blue, turns to golden yellow (0xfacc15) after breaking yellow box
        this.bullets = [];

        // Squad members (starts with 1 player, grows with gates)
        this.squad = [];
        this.basePlayerModel = null;
        this.baseBossModel = null;
        this.bossAnimations = [];
        this.finalBoss = null;
        this.modelLoaded = false;

        // Lists
        this.debrisList = [];
        this.particlesList = [];
        this.floatingTexts = [];
        this.floatingWeapons = [];
        this.redMinions = [];
        this.boxObstacles = [];
        this.gates = [];
        this.leftGates = [];

        // Clock & Timing
        this.clock = new THREE.Clock();
        this.animTime = 0;

        this.clips = this.createAnimationClips();
        this.initThree();
        this.createWorldContainer();
        this.createMountainEnvironment();
        this.createBridgeTracks();
        this.createCourseLayout();
        this.setupInitialPlayer(); // Ensure runner with gun is visible on frame 1!
        this.loadPlayerModel();
        this.loadBossModel();
        this.setupEventListeners();
        this.renderer.render(this.scene, this.camera);
    }

    initThree() {
        this.scene = new THREE.Scene();
        // Warm creamy sand beige sky matching the reference image exactly
        this.scene.background = new THREE.Color(0xe8decb);
        this.scene.fog = new THREE.FogExp2(0xe8decb, 0.0038);

        // Perspective camera behind player looking down the running bridge track
        this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 400);
        this.camera.position.set(0.4, 8.2, -10.5);
        this.camera.lookAt(0.4, 1.3, 15.0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.18;

        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.zIndex = '0';
        if (this.container.firstChild) {
            this.container.insertBefore(this.renderer.domElement, this.container.firstChild);
        } else {
            this.container.appendChild(this.renderer.domElement);
        }

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xfffbf2, 0xe2d6c1, 0.7);
        this.scene.add(hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.45);
        this.dirLight.position.set(-14, 28, -10);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 120;
        this.dirLight.shadow.camera.left = -20;
        this.dirLight.shadow.camera.right = 20;
        this.dirLight.shadow.camera.top = 25;
        this.dirLight.shadow.camera.bottom = -25;
        this.dirLight.shadow.bias = -0.0003;
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);
        this.dirLight.target.position.set(0.6, 0, 10);
    }

    createWorldContainer() {
        // Group for right lane objects (moving from the start)
        this.rightLaneGroup = new THREE.Group();
        this.scene.add(this.rightLaneGroup);

        // Group for left booster gates (moves ONLY after Box 23 is destroyed)
        this.leftGatesGroup = new THREE.Group();
        this.scene.add(this.leftGatesGroup);

        // Group for stationary Box 23 (stands completely still)
        this.stationaryGroup = new THREE.Group();
        this.scene.add(this.stationaryGroup);
    }

    // -----------------------------------------------------------------
    // ENVIRONMENT: Stadium Environment with Giant Soccer Balls
    // -----------------------------------------------------------------
    createMountainEnvironment() {
        // Ground plane surrounding the elevated track
        const groundGeo = new THREE.PlaneGeometry(300, 600);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0xe2d6c1, roughness: 0.9 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -6.0, 100);
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Giant Soccer Balls beside the track as in the reference image
        const ballPositions = [
            [-5.4, 4.2, 38],
            [6.2, 4.2, 42],
            [-5.6, 4.5, 96],
            [6.4, 4.5, 102],
            [-5.5, 4.8, 160],
            [6.5, 4.8, 165]
        ];

        ballPositions.forEach(([bx, by, bz]) => {
            const soccerBall = this.createSoccerBallMesh();
            soccerBall.position.set(bx, by, bz);
            soccerBall.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
            this.scene.add(soccerBall);
        });
    }

    createSoccerBallMesh() {
        if (!this._cachedSoccerGeometry) {
            const radius = 1.5;
            const t = (1 + Math.sqrt(5)) / 2;
            const icoVerts = [
                new THREE.Vector3(-1,  t,  0).normalize(),
                new THREE.Vector3( 1,  t,  0).normalize(),
                new THREE.Vector3(-1, -t,  0).normalize(),
                new THREE.Vector3( 1, -t,  0).normalize(),
                new THREE.Vector3( 0, -1,  t).normalize(),
                new THREE.Vector3( 0,  1,  t).normalize(),
                new THREE.Vector3( 0, -1, -t).normalize(),
                new THREE.Vector3( 0,  1, -t).normalize(),
                new THREE.Vector3( t,  0, -1).normalize(),
                new THREE.Vector3( t,  0,  1).normalize(),
                new THREE.Vector3(-t,  0, -1).normalize(),
                new THREE.Vector3(-t,  0,  1).normalize()
            ];

            const icoFaces = [
                [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
                [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
                [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
            ];

            // Extract 30 unique edges
            const edgeMap = new Map();
            const getEdgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

            icoFaces.forEach(f => {
                const pairs = [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]];
                pairs.forEach(([a, b]) => {
                    const key = getEdgeKey(a, b);
                    if (!edgeMap.has(key)) {
                        edgeMap.set(key, { a, b });
                    }
                });
            });

            // Compute the two points on each edge at 1/3 and 2/3
            const edgePoints = new Map();
            edgeMap.forEach(({ a, b }, key) => {
                const va = icoVerts[a];
                const vb = icoVerts[b];

                const pA = new THREE.Vector3().copy(va).multiplyScalar(2/3).addScaledVector(vb, 1/3).normalize().multiplyScalar(radius);
                const pB = new THREE.Vector3().copy(va).multiplyScalar(1/3).addScaledVector(vb, 2/3).normalize().multiplyScalar(radius);

                edgePoints.set(key, { pA, pB, a, b });
            });

            const sortCyclic = (pts, center) => {
                let u = new THREE.Vector3(0, 1, 0).cross(center);
                if (u.lengthSq() < 0.001) u = new THREE.Vector3(1, 0, 0).cross(center);
                u.normalize();
                const v = new THREE.Vector3().crossVectors(center, u).normalize();

                const withAngles = pts.map(p => {
                    const proj = new THREE.Vector3().subVectors(p, new THREE.Vector3().copy(center).multiplyScalar(p.dot(center) / center.lengthSq()));
                    return { p, angle: Math.atan2(proj.dot(v), proj.dot(u)) };
                });
                withAngles.sort((a, b) => a.angle - b.angle);
                const sorted = withAngles.map(item => item.p);

                // Check winding order for outwards facing normal
                const e1 = new THREE.Vector3().subVectors(sorted[1], sorted[0]);
                const e2 = new THREE.Vector3().subVectors(sorted[2], sorted[0]);
                const norm = new THREE.Vector3().crossVectors(e1, e2);
                if (norm.dot(center) < 0) {
                    sorted.reverse();
                }
                return sorted;
            };

            const whitePositions = [];
            const greenPositions = [];

            // 1. Build 20 Hexagons (White faces)
            icoFaces.forEach(f => {
                const va = icoVerts[f[0]];
                const vb = icoVerts[f[1]];
                const vc = icoVerts[f[2]];
                const faceCenter = new THREE.Vector3().add(va).add(vb).add(vc).divideScalar(3).normalize();

                const eAB = edgePoints.get(getEdgeKey(f[0], f[1]));
                const eBC = edgePoints.get(getEdgeKey(f[1], f[2]));
                const eCA = edgePoints.get(getEdgeKey(f[2], f[0]));

                const hexPts = [
                    eAB.pA, eAB.pB,
                    eBC.pA, eBC.pB,
                    eCA.pA, eCA.pB
                ];

                const sortedHex = sortCyclic(hexPts, faceCenter);

                // Triangulate 6-gon: (0,1,2), (0,2,3), (0,3,4), (0,4,5)
                for (let i = 1; i < 5; i++) {
                    whitePositions.push(
                        sortedHex[0].x, sortedHex[0].y, sortedHex[0].z,
                        sortedHex[i].x, sortedHex[i].y, sortedHex[i].z,
                        sortedHex[i + 1].x, sortedHex[i + 1].y, sortedHex[i + 1].z
                    );
                }
            });

            // 2. Build 12 Pentagons (Green faces)
            for (let i = 0; i < 12; i++) {
                const vertCenter = icoVerts[i];
                const pentPts = [];

                edgePoints.forEach(e => {
                    if (e.a === i) pentPts.push(e.pA);
                    else if (e.b === i) pentPts.push(e.pB);
                });

                const sortedPent = sortCyclic(pentPts, vertCenter);

                // Triangulate 5-gon: (0,1,2), (0,2,3), (0,3,4)
                for (let j = 1; j < 4; j++) {
                    greenPositions.push(
                        sortedPent[0].x, sortedPent[0].y, sortedPent[0].z,
                        sortedPent[j].x, sortedPent[j].y, sortedPent[j].z,
                        sortedPent[j + 1].x, sortedPent[j + 1].y, sortedPent[j + 1].z
                    );
                }
            }

            const geo = new THREE.BufferGeometry();
            const allPositions = new Float32Array([...whitePositions, ...greenPositions]);
            geo.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));

            const whiteVertCount = whitePositions.length / 3;
            const greenVertCount = greenPositions.length / 3;

            geo.addGroup(0, whiteVertCount, 0); // Material 0: White
            geo.addGroup(whiteVertCount, greenVertCount, 1); // Material 1: Green

            geo.computeVertexNormals();
            this._cachedSoccerGeometry = geo;
        }

        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.28,
            metalness: 0.05,
            flatShading: true
        });
        const greenMat = new THREE.MeshStandardMaterial({
            color: 0x15803d, // Classic soccer dark green
            roughness: 0.28,
            metalness: 0.05,
            flatShading: true
        });

        const ball = new THREE.Mesh(this._cachedSoccerGeometry, [whiteMat, greenMat]);
        ball.castShadow = true;
        ball.receiveShadow = true;
        return ball;
    }

    // -----------------------------------------------------------------
    // BRIDGE TRACKS (Red Athletic Track + Alternating Green Striped Track + White Fence)
    // -----------------------------------------------------------------
    createBridgeTracks() {
        const trackLength = this.totalTrackLength + 100;
        this.trackGroup = new THREE.Group();

        // 1. Red Athletic Track on Screen-Left (~70% compact width, from x = 1.65 to x = 3.60, width = 1.95m)
        const redTrackWidth = 1.95;
        const redTrackCenter = 2.625;
        const redTrackGeo = new THREE.PlaneGeometry(redTrackWidth, trackLength);
        const redTrackMat = new THREE.MeshStandardMaterial({
            color: 0xc45240, // Terracotta red running track
            roughness: 0.7,
            metalness: 0.05
        });
        const redTrack = new THREE.Mesh(redTrackGeo, redTrackMat);
        redTrack.rotation.x = -Math.PI / 2;
        redTrack.position.set(redTrackCenter, 0.01, trackLength / 2 - 20);
        redTrack.receiveShadow = true;
        this.trackGroup.add(redTrack);

        // White Lane Stripes on Red Track (compact 3 lanes)
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        [1.85, 2.25, 2.62, 3.00, 3.38].forEach(lx => {
            const lineGeo = new THREE.PlaneGeometry(0.035, trackLength);
            const lineMesh = new THREE.Mesh(lineGeo, lineMat);
            lineMesh.rotation.x = -Math.PI / 2;
            lineMesh.position.set(lx, 0.015, trackLength / 2 - 20);
            this.trackGroup.add(lineMesh);
        });

        // 2. Dark Forest Green Curbs (Both Outer Borders & Middle Divider)
        const curbMat = new THREE.MeshStandardMaterial({
            color: 0x386340, // Forest green curb
            roughness: 0.7
        });

        // Center Green Divider Curb separating Red Track and Green Track (at x = 1.65)
        const centerCurb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, trackLength), curbMat);
        centerCurb.position.set(1.65, 0.04, trackLength / 2 - 20);
        centerCurb.receiveShadow = true;
        this.trackGroup.add(centerCurb);

        // 3. Main Track on Screen-Right: Alternating Green Stripes (from x = -2.95 to x = 1.65, width = 4.60m)
        const greenWidth = 4.60;
        const greenCenter = -0.675;
        const stripeLength = 6.0;

        const darkGreenMat = new THREE.MeshStandardMaterial({
            color: 0x559c63, // Grass green
            roughness: 0.65,
            metalness: 0.05
        });
        const lightGreenMat = new THREE.MeshStandardMaterial({
            color: 0xcbf3d2, // Light pastel mint green
            roughness: 0.65,
            metalness: 0.05
        });

        const segmentGeo = new THREE.PlaneGeometry(greenWidth, stripeLength);
        let stripeIdx = 0;
        for (let z = -20; z < trackLength; z += stripeLength) {
            const mat = (stripeIdx % 2 === 0) ? darkGreenMat : lightGreenMat;
            const segment = new THREE.Mesh(segmentGeo, mat);
            segment.rotation.x = -Math.PI / 2;
            segment.position.set(greenCenter, 0.01, z + stripeLength / 2);
            segment.receiveShadow = true;
            this.trackGroup.add(segment);
            stripeIdx++;
        }

        // 4. Outer Dark Forest Green Curbs
        const leftCurb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, trackLength), curbMat);
        leftCurb.position.set(-2.95, 0.04, trackLength / 2 - 20);
        leftCurb.receiveShadow = true;
        this.trackGroup.add(leftCurb);

        const rightCurb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, trackLength), curbMat);
        rightCurb.position.set(3.68, 0.04, trackLength / 2 - 20);
        rightCurb.receiveShadow = true;
        this.trackGroup.add(rightCurb);

        // Base deck
        const deckMat = new THREE.MeshStandardMaterial({ color: 0x274a2e, roughness: 0.9 });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.5, trackLength), deckMat);
        deck.position.set(0.35, -0.26, trackLength / 2 - 20);
        this.trackGroup.add(deck);

        // Underside pillars
        const pillarGeo = new THREE.CylinderGeometry(0.8, 1.0, 24, 12);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4a6b52, roughness: 0.9 });
        for (let z = -10; z < trackLength; z += 30) {
            [-1.8, 2.2].forEach(px => {
                const pillar = new THREE.Mesh(pillarGeo, pillarMat);
                pillar.position.set(px, -12.3, z);
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                this.trackGroup.add(pillar);
            });
        }

        // 5. White Post-and-Rail Fence along both outer sides
        this.createWhiteRailings(trackLength);

        this.scene.add(this.trackGroup);
    }

    createWhiteRailings(trackLength) {
        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.35,
            metalness: 0.1
        });

        const panelLength = 1.35;
        const gap = 0.85;
        const step = panelLength + gap; // 2.2m step between panels

        const postGeo = new THREE.BoxGeometry(0.08, 0.82, 0.08);
        const capGeo = new THREE.BoxGeometry(0.10, 0.035, 0.10);
        const topRailGeo = new THREE.BoxGeometry(0.06, 0.06, panelLength);
        const midRailGeo = new THREE.BoxGeometry(0.045, 0.045, panelLength);

        // Outer railings run full length; middle dividing railing starts from yellow Box 3 (z = 15.0)
        const railings = [
            { x: -2.95, startZ: -20, endZ: trackLength }, // Outer Right Railing
            { x: 1.65, startZ: 15.0, endZ: trackLength }, // Middle Dividing Railing (starts at yellow Box 3)
            { x: 3.60, startZ: -20, endZ: trackLength }  // Outer Left Railing
        ];

        railings.forEach(({ x, startZ, endZ }) => {
            for (let z = startZ; z <= endZ - panelLength; z += step) {
                const centerZ = z + panelLength / 2;
                const postOffset = panelLength / 2 - 0.04;

                // Top Rail of Panel
                const topRail = new THREE.Mesh(topRailGeo, whiteMat);
                topRail.position.set(x, 0.72, centerZ);
                topRail.castShadow = true;
                this.trackGroup.add(topRail);

                // Mid Rail of Panel
                const midRail = new THREE.Mesh(midRailGeo, whiteMat);
                midRail.position.set(x, 0.38, centerZ);
                midRail.castShadow = true;
                this.trackGroup.add(midRail);

                // Left & Right Vertical Posts for this Panel
                [-postOffset, postOffset].forEach(pz => {
                    const post = new THREE.Mesh(postGeo, whiteMat);
                    post.position.set(x, 0.42, centerZ + pz);
                    post.castShadow = true;
                    post.receiveShadow = true;
                    this.trackGroup.add(post);

                    const cap = new THREE.Mesh(capGeo, whiteMat);
                    cap.position.set(x, 0.84, centerZ + pz);
                    this.trackGroup.add(cap);
                });
            }
        });
    }

    // -----------------------------------------------------------------
    // COURSE LAYOUT
    // -----------------------------------------------------------------
    createCourseLayout() {
        // 1. VISUAL LEFT LANE: Box 3 with Gun (Weapon_1) on the 70% compact red track (x = 2.62)
        const box3 = this.createNumberCrateStack({
            x: 2.62,
            z: 16.0,
            width: 1.85,
            height: 1.0,
            depth: 1.3,
            hp: 3,
            label: '3',
            hasWeapon: true,
            isStationary: true
        });
        this.boxObstacles.push(box3);

        // Continuous row of +1 gates along the compact left lane
        for (let z = 18.2; z <= 260; z += 5.4) {
            const gate = this.createLeftBoosterGate(2.62, z, '+1');
            this.leftGates.push(gate);
        }

        // 2. VISUAL RIGHT LANE: Colossal Swarm of Red Minions spread across the wide green track
        const minionCount = 350;
        for (let i = 0; i < minionCount; i++) {
            const progress = i / minionCount;
            const z = 34 + progress * 88 + (Math.random() - 0.5) * 3.5;
            // Spread across the right green track safely inside railings (from -2.35 to 1.20)
            const x = -2.35 + Math.random() * 3.55;
            this.spawnRedMinion(x, z, { hp: 2 });
        }

        // Giant Red Boss standing on the green track (z = 126) behind the red army
        this.createFinalBoss(126, { hp: 38000, maxHp: 38000 });
    }

    createNumberCrateStack(config) {
        const group = new THREE.Group();
        group.position.set(config.x, 0, config.z);

        const width = config.width;
        const height = config.height;
        const depth = config.depth;

        // Bright yellow block material matching the image
        const yellowMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            roughness: 0.3,
            metalness: 0.1
        });
        const yellowSideMat = new THREE.MeshStandardMaterial({
            color: 0xeab308,
            roughness: 0.35,
            metalness: 0.1
        });

        const blockGeo = new THREE.BoxGeometry(width, height, depth);
        const bMesh = new THREE.Mesh(blockGeo, [
            yellowSideMat, yellowSideMat, // right, left
            yellowMat, yellowSideMat,     // top, bottom
            yellowMat, yellowSideMat      // front, back
        ]);
        bMesh.position.set(0, height / 2, 0);
        bMesh.castShadow = true;
        bMesh.receiveShadow = true;
        group.add(bMesh);

        // Tilted high-contrast number badge on Box 3 facing camera directly
        const numberPlatteGeo = new THREE.PlaneGeometry(width * 0.65, height * 0.9);
        const numberCanvas = document.createElement('canvas');
        numberCanvas.width = 256;
        numberCanvas.height = 256;
        const nCtx = numberCanvas.getContext('2d');
        this.renderTextOnCanvas(nCtx, 256, 256, config.label, {
            fontSize: 130,
            textColor: '#0f172a',
            strokeColor: '#ffffff',
            strokeWidth: 16
        });
        const nTexture = new THREE.CanvasTexture(numberCanvas);
        const nMat = new THREE.MeshBasicMaterial({ map: nTexture, transparent: true, side: THREE.DoubleSide });
        const numberMesh = new THREE.Mesh(numberPlatteGeo, nMat);
        numberMesh.position.set(0, height * 0.58, -depth / 2 - 0.06);
        numberMesh.rotation.set(0.42, Math.PI, 0); // Face camera correctly without mirroring!
        group.add(numberMesh);

        // Floating Weapon on top of Box (Weapon_1.webp sprite)
        let weaponModel = null;
        if (config.hasWeapon) {
            weaponModel = this.createFloatingWeaponMesh();
            weaponModel.position.set(0, height + 0.65, 0);
            group.add(weaponModel);
            this.floatingWeapons.push({
                model: weaponModel,
                baseY: height + 0.65,
                parentBox: group
            });
        }

        // Stationary box (Box 3) added to stationaryGroup
        if (config.isStationary) {
            this.stationaryGroup.add(group);
        } else {
            this.rightLaneGroup.add(group);
        }

        const boxObj = {
            group: group,
            bMesh: bMesh,
            localX: config.x,
            localZ: config.z,
            isStationary: !!config.isStationary,
            width: width,
            height: height,
            depth: depth,
            hp: config.hp,
            maxHp: config.hp,
            label: config.label,
            numberMesh: numberMesh,
            weaponModel: weaponModel,
            hasWeapon: config.hasWeapon,
            isDestroyed: false,
            onHit: function(dmg) {
                const currentVal = Math.max(0, Math.ceil(this.hp)).toString();
                nCtx.clearRect(0, 0, 256, 256);
                nCtx.font = '900 130px "Arial Black", Impact, sans-serif';
                nCtx.textAlign = 'center';
                nCtx.textBaseline = 'middle';

                nCtx.lineWidth = 16;
                nCtx.strokeStyle = '#ffffff';
                nCtx.lineJoin = 'round';
                nCtx.strokeText(currentVal, 128, 128);

                nCtx.fillStyle = '#0f172a';
                nCtx.fillText(currentVal, 128, 128);

                nTexture.needsUpdate = true;

                group.position.x = this.localX + (Math.random() - 0.5) * 0.08;
                setTimeout(() => { group.position.x = this.localX; }, 35);
            },
            onDestroy: function() {
                const isStationary = !!config.isStationary;
                const worldPos = isStationary ? group.position.clone() : new THREE.Vector3(group.position.x, group.position.y, group.position.z - this.distanceTravelled);
                this.spawnDebris(worldPos, isStationary);
                this.bulletColor = 0xfacc15; // Change bullet color to golden yellow!
                if (weaponModel) {
                    this.triggerWeaponPickup(weaponModel, worldPos);
                }
                if (isStationary) {
                    this.isBox23Destroyed = true; // Unlock left gates movement!
                }
                group.visible = false;
            }.bind(this)
        };

        return boxObj;
    }

    spawnDebris(worldPos, isStationary = false) {
        // Explode into 10 yellow debris blocks
        const pieceGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const pieceMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
        for (let i = 0; i < 10; i++) {
            const piece = new THREE.Mesh(pieceGeo, pieceMat);
            piece.position.copy(worldPos).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4));
            this.scene.add(piece);
            this.debrisList.push({
                mesh: piece,
                vx: (Math.random() - 0.5) * 9,
                vy: 5 + Math.random() * 6,
                vz: -this.worldSpeed * 0.6 + (Math.random() - 0.5) * 5,
                rotV: Math.random() * 10 + 4,
                life: 1.5
            });
        }
    }

    createFloatingWeaponMesh() {
        const group = new THREE.Group();

        // 2D Sprite for Weapon_1.webp facing camera naturally
        const spriteMat = new THREE.SpriteMaterial({
            map: this.weapon1Texture,
            transparent: true,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.5, 1.5, 1);
        group.add(sprite);

        return group;
    }

    createAK47Model() {
        const gun = new THREE.Group();

        // 1. Materials matching the reference image:
        // Royal / Electric Blue for Stock, Handguard, and Grip
        const blueMat = new THREE.MeshStandardMaterial({
            color: 0x2563eb,
            roughness: 0.3,
            metalness: 0.35
        });
        // Dark Gunmetal / Charcoal Metal for Receiver, Barrel, Mag, Sights
        const darkMetalMat = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.35,
            metalness: 0.85
        });
        const accentMetalMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.4,
            metalness: 0.7
        });

        // 2. Receiver (Thân súng)
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.20, 0.85), darkMetalMat);
        receiver.position.set(0, 0, 0);
        receiver.castShadow = true;
        gun.add(receiver);

        const dustCover = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.72), darkMetalMat);
        dustCover.position.set(0, 0.13, -0.06);
        gun.add(dustCover);

        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.14), accentMetalMat);
        rearSight.position.set(0, 0.13, 0.34);
        gun.add(rearSight);

        // 3. Royal Blue Handguard (Ốp lót tay)
        const lowerHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.52), blueMat);
        lowerHandguard.position.set(0, 0.01, 0.68);
        lowerHandguard.castShadow = true;
        gun.add(lowerHandguard);

        const upperHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.10, 0.46), blueMat);
        upperHandguard.position.set(0, 0.12, 0.68);
        gun.add(upperHandguard);

        // 4. Royal Blue Stock (Báng súng)
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.24, 0.72), blueMat);
        stock.position.set(0, -0.04, -0.74);
        stock.rotation.x = -0.08;
        stock.castShadow = true;
        gun.add(stock);

        const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.25, 0.05), darkMetalMat);
        buttPlate.position.set(0, -0.07, -1.10);
        buttPlate.rotation.x = -0.08;
        gun.add(buttPlate);

        // 5. Royal Blue Pistol Grip (Tay cầm)
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.30, 0.13), blueMat);
        grip.position.set(0, -0.21, -0.22);
        grip.rotation.x = -0.42;
        grip.castShadow = true;
        gun.add(grip);

        // 6. Curved Banana Magazine (Băng đạn cong đặc trưng AK)
        const magUpper = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.20), darkMetalMat);
        magUpper.position.set(0, -0.20, 0.24);
        magUpper.rotation.x = 0.32;
        magUpper.castShadow = true;
        gun.add(magUpper);

        const magLower = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.18), darkMetalMat);
        magLower.position.set(0, -0.38, 0.33);
        magLower.rotation.x = 0.56;
        magLower.castShadow = true;
        gun.add(magLower);

        // 7. Barrel, Gas Tube, Front Sight & Muzzle (Nòng & Đầu ruồi)
        const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.56, 8), darkMetalMat);
        gasTube.rotation.x = Math.PI / 2;
        gasTube.position.set(0, 0.11, 0.70);
        gun.add(gasTube);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.10, 8), darkMetalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, 1.05);
        barrel.castShadow = true;
        gun.add(barrel);

        const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.07), darkMetalMat);
        frontSight.position.set(0, 0.11, 1.48);
        gun.add(frontSight);

        const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.12, 8), darkMetalMat);
        muzzleBrake.rotation.x = Math.PI / 2;
        muzzleBrake.position.set(0, 0.02, 1.62);
        gun.add(muzzleBrake);

        // 8. Trigger Guard (Vành cò)
        const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.16), darkMetalMat);
        triggerGuard.position.set(0, -0.13, -0.04);
        gun.add(triggerGuard);

        return gun;
    }

    triggerWeaponPickup(weaponModel, worldPos) {
        this.bulletPower += 2;
        this.fireInterval = 0.11; // Fast rapid fire after unlocking the gun!
        this.bulletColor = 0xfacc15; // Golden yellow bullet color!
        this.onPowerUp({ type: 'gun', power: this.bulletPower });

        for (let i = 0; i < 25; i++) {
            this.spawnSparkParticle(this.playerX, 1.2, this.playerZ, 0xfacc15);
        }
    }

    createLeftBoosterGate(x, z, label) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const width = 1.85;
        const height = 2.4;

        const frameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.08), frameMat);
        postL.position.set(-width / 2, height / 2, 0);
        group.add(postL);

        const postR = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.08), frameMat);
        postR.position.set(width / 2, height / 2, 0);
        group.add(postR);

        const energyMat = new THREE.MeshBasicMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.38,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const energyMesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.1, height * 0.72), energyMat);
        energyMesh.position.set(0, height * 0.45, 0);
        group.add(energyMesh);

        group.rotation.set(0.36, Math.PI, 0); // Face camera directly without mirroring!

        const gCanvas = document.createElement('canvas');
        gCanvas.width = 256;
        gCanvas.height = 144;
        const gCtx = gCanvas.getContext('2d');
        this.renderTextOnCanvas(gCtx, 256, 144, label, {
            fontSize: 96,
            textColor: '#ffffff',
            strokeColor: '#0369a1',
            strokeWidth: 16
        });
        const gTexture = new THREE.CanvasTexture(gCanvas);
        const gMat = new THREE.MeshBasicMaterial({ map: gTexture, transparent: true, side: THREE.DoubleSide });
        const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.85), gMat);
        textMesh.position.set(0, height * 0.48, 0.05);
        group.add(textMesh);

        this.leftGatesGroup.add(group);

        return {
            group: group,
            localX: x,
            localZ: z,
            width: width,
            isTriggered: false,
            onHitBullet: () => {
                this.bulletPower += 0.25;
                energyMat.opacity = 0.9;
                setTimeout(() => { energyMat.opacity = 0.38; }, 80);
                const currentGateZ = this.isBox23Destroyed ? (z - this.leftGatesDistance) : z;
                this.spawnSparkParticle(x, 1.2, this.playerZ + currentGateZ, 0x38bdf8);
            },
            onPassPlayer: () => {
                // When player passes through +1 gate, add 1 runner!
                if (this.squad.length < 150) {
                    this.addMemberToSquad();
                    this.recalculateSquadFormation();
                    this.onSquadCountChange(this.squad.length);
                }
                this.bulletPower += 0.15;
            }
        };
    }

    spawnRedMinion(x, z, config) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const minionScale = 0.42 + Math.random() * 0.11; // Scaled down to ~70% size
        const rotOffset = (Math.random() - 0.5) * 0.35;
        group.rotation.y = Math.PI + rotOffset; // Face towards player!

        const minionObj = {
            group: group,
            model: null,
            mixer: null,
            baseLocalX: x,
            baseLocalZ: z,
            localX: x,
            localZ: z,
            scale: minionScale,
            rotOffset: rotOffset,
            wobbleSpeed: 2.2 + Math.random() * 3.4,
            wobbleAmp: 0.10 + Math.random() * 0.22,
            wobblePhase: Math.random() * Math.PI * 2,
            driftSpeed: (Math.random() - 0.5) * 1.4,
            hp: config.hp || 2,
            maxHp: config.hp || 2,
            isDestroyed: false
        };

        if (this.baseBossModel) {
            this.setupRedMinionMesh(minionObj);
        } else {
            this.setupProceduralRedMinionMesh(minionObj);
        }

        this.rightLaneGroup.add(group);
        this.redMinions.push(minionObj);
    }

    setupRedMinionMesh(minionObj) {
        if (!this.baseBossModel) return;
        try {
            if (minionObj.proceduralGroup) {
                minionObj.group.remove(minionObj.proceduralGroup);
                minionObj.proceduralGroup = null;
            }
            if (minionObj.model) {
                minionObj.group.remove(minionObj.model);
            }

            const m = SkeletonUtils.clone(this.baseBossModel);
            const s = minionObj.scale || 0.65;
            m.scale.set(s, s, s);
            m.rotation.y = 0; // Group handles facing direction (Math.PI)

            const redMat = new THREE.MeshStandardMaterial({
                color: 0xdc2626,
                roughness: 0.35,
                metalness: 0.2
            });

            m.traverse(node => {
                if (node.isMesh || node.isSkinnedMesh) {
                    node.material = redMat;
                    node.frustumCulled = false;
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            const mixer = new THREE.AnimationMixer(m);
            if (this.bossAnimations && this.bossAnimations.length > 0) {
                const action = mixer.clipAction(this.bossAnimations[0]);
                action.timeScale = 0.85 + Math.random() * 0.35; // Asynchronous leg movements
                action.play();
                mixer.setTime(Math.random() * 1.2);
                minionObj.mixer = mixer;
            } else if (this.clips && this.clips.run) {
                const action = mixer.clipAction(this.clips.run);
                action.timeScale = 0.85 + Math.random() * 0.35;
                action.play();
                mixer.setTime(Math.random() * 1.2);
                minionObj.mixer = mixer;
            }

            minionObj.group.add(m);
            minionObj.model = m;
        } catch (e) {
            console.warn('Error setting up red minion mesh', e);
        }
    }

    setupProceduralRedMinionMesh(minionObj) {
        const procGroup = new THREE.Group();
        const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 });
        const tanMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 });

        const s = minionObj.scale || 0.65;
        procGroup.scale.set(s, s, s);
        procGroup.rotation.y = 0;

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 10), redMat);
        body.position.y = 0.55;
        body.castShadow = true;
        procGroup.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), redMat);
        head.position.y = 1.05;
        head.castShadow = true;
        procGroup.add(head);

        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.16), tanMat);
        legs.position.y = 0.16;
        procGroup.add(legs);

        minionObj.group.add(procGroup);
        minionObj.proceduralGroup = procGroup;
        minionObj.model = null;
    }

    createFinalBoss(z, config = {}) {
        const group = new THREE.Group();
        group.position.set(-1.1, 0, z);

        const bossHp = config.hp || 38000;
        this.finalBoss = {
            group: group,
            model: null,
            mixer: null,
            localX: -1.1,
            localZ: z,
            hp: bossHp,
            maxHp: bossHp,
            isDestroyed: false,
            hpBarMesh: null
        };

        // Health Bar above Boss (Positioned cleanly at y = 7.6m with left-pivot fill)
        const barW = 3.8;
        const barH = 0.42;

        const hpBarContainer = new THREE.Group();
        hpBarContainer.position.set(0, 7.6, 0);
        hpBarContainer.rotation.x = 0.38; // Tilted towards the camera

        // Dark Background Border
        const barBorder = new THREE.Mesh(
            new THREE.PlaneGeometry(barW + 0.16, barH + 0.12),
            new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide, depthTest: false })
        );
        barBorder.renderOrder = 998;
        hpBarContainer.add(barBorder);

        const barBg = new THREE.Mesh(
            new THREE.PlaneGeometry(barW, barH),
            new THREE.MeshBasicMaterial({ color: 0x334155, side: THREE.DoubleSide, depthTest: false })
        );
        barBg.position.z = 0.01;
        barBg.renderOrder = 998;
        hpBarContainer.add(barBg);

        // Fill bar anchored at left edge
        const barFillGeo = new THREE.PlaneGeometry(barW, barH);
        barFillGeo.translate(barW / 2, 0, 0); // Translate so scaling x shrinks from right to left!
        const barFill = new THREE.Mesh(
            barFillGeo,
            new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, depthTest: false })
        );
        barFill.position.set(-barW / 2, 0, 0.02);
        barFill.renderOrder = 999;
        hpBarContainer.add(barFill);
        this.finalBoss.hpBarMesh = barFill;

        group.add(hpBarContainer);

        // 3. Glowing Boss ground ring
        const ringGeo = new THREE.RingGeometry(1.6, 2.2, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        group.add(ring);

        if (this.baseBossModel) {
            this.setupBossMesh();
        } else {
            this.setupProceduralBossMesh();
        }

        this.rightLaneGroup.add(group);
    }

    setupBossMesh() {
        if (!this.baseBossModel || !this.finalBoss) return;
        try {
            if (this.finalBoss.proceduralGroup) {
                this.finalBoss.group.remove(this.finalBoss.proceduralGroup);
                this.finalBoss.proceduralGroup = null;
            }
            if (this.finalBoss.model) {
                this.finalBoss.group.remove(this.finalBoss.model);
            }

            const m = SkeletonUtils.clone(this.baseBossModel);
            m.scale.set(2.8, 2.8, 2.8);
            m.rotation.y = Math.PI; // Face towards player squad

            m.traverse(node => {
                if (node.isMesh || node.isSkinnedMesh) {
                    node.frustumCulled = false;
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            const mixer = new THREE.AnimationMixer(m);
            if (this.bossAnimations && this.bossAnimations.length > 0) {
                const action = mixer.clipAction(this.bossAnimations[0]);
                action.play();
                this.finalBoss.mixer = mixer;
            } else if (this.clips && this.clips.run) {
                const action = mixer.clipAction(this.clips.run);
                action.play();
                this.finalBoss.mixer = mixer;
            }

            this.finalBoss.group.add(m);
            this.finalBoss.model = m;
        } catch (e) {
            console.warn('Error setting up boss mesh', e);
        }
    }

    setupProceduralBossMesh() {
        if (!this.finalBoss) return;
        const procGroup = new THREE.Group();
        const redMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.35 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.8, 12), redMat);
        body.position.y = 2.0;
        body.castShadow = true;
        procGroup.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 16), redMat);
        head.position.y = 3.8;
        head.castShadow = true;
        procGroup.add(head);

        this.finalBoss.group.add(procGroup);
        this.finalBoss.proceduralGroup = procGroup;
        this.finalBoss.model = null;
    }

    loadBossModel() {
        const loader = new GLTFLoader();
        loader.load(athleteModelUrl, (gltf) => {
            this.baseBossModel = gltf.scene;
            this.bossAnimations = gltf.animations || [];
            this.setupBossMesh();
            // Apply Athlete_05 model to all Red Minions / Enemies
            this.redMinions.forEach(m => {
                this.setupRedMinionMesh(m);
            });
        }, undefined, (err) => {
            console.warn('Fallback loading boss model', err);
            this.setupProceduralBossMesh();
        });
    }

    // -----------------------------------------------------------------
    // 3D MODEL LOADING: Hero_02 & Athlete_05
    // -----------------------------------------------------------------
    setupInitialPlayer() {
        // Create initial player runner on frame 1 so player is immediately visible with a gun
        this.fallbackHero();
    }

    loadPlayerModel() {
        const loader = new GLTFLoader();

        const setupModel = (gltf) => {
            this.basePlayerModel = gltf.scene;
            this.basePlayerModel.scale.set(0.65, 0.65, 0.65);

            this.basePlayerModel.traverse((node) => {
                if (node.isSkinnedMesh || node.isMesh) {
                    node.frustumCulled = false;
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            this.modelLoaded = true;

            // Upgrade squad with Hero_02 model
            if (this.squad.length > 0) {
                this.squad.forEach(member => {
                    if (member && member.model) {
                        this.scene.remove(member.model);
                    }
                });
                this.squad = [];
            }
            this.addMemberToSquad(0, 0);
            this.onSquadCountChange(this.squad.length);
        };

        fetch(heroModelUrl)
            .then(res => res.arrayBuffer())
            .then(buffer => {
                loader.parse(buffer, '', (gltf) => {
                    setupModel(gltf);
                }, () => {
                    loader.load(heroModelUrl, setupModel, undefined, () => this.fallbackHero());
                });
            })
            .catch(() => {
                loader.load(heroModelUrl, setupModel, undefined, () => this.fallbackHero());
            });
    }

    fallbackHero() {
        this.basePlayerModel = new THREE.Group();
        const blueMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3 });
        const tanMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 });

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), tanMat);
        head.position.y = 0.9;
        this.basePlayerModel.add(head);

        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), blueMat);
        helmet.position.y = 0.94;
        this.basePlayerModel.add(helmet);

        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.48, 12), tanMat);
        torso.position.y = 0.56;
        this.basePlayerModel.add(torso);

        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.16), blueMat);
        legs.position.y = 0.22;
        this.basePlayerModel.add(legs);

        this.modelLoaded = true;
        if (this.squad.length === 0) {
            this.addMemberToSquad(0, 0);
            this.onSquadCountChange(this.squad.length);
        }
        this.redMinions.forEach(m => {
            this.setupRedMinionMesh(m);
        });
    }

    addMemberToSquad(offsetX = 0, offsetZ = 0) {
        if (!this.basePlayerModel) return;

        let memberModel;
        try {
            memberModel = SkeletonUtils.clone(this.basePlayerModel);
        } catch (e) {
            memberModel = this.basePlayerModel.clone(true);
        }

        // Stationary player squad stays at world Z = 0 + offsetZ
        memberModel.position.set(this.playerX + offsetX, 0, this.playerZ + offsetZ);

        this.scene.add(memberModel);

        const bones = {};
        memberModel.traverse((node) => {
            if (node.isSkinnedMesh || node.isMesh) {
                node.frustumCulled = false;
                node.castShadow = true;
                node.receiveShadow = true;
            }
            if (node.isBone || node.name) {
                bones[node.name] = node;
            }
        });

        const mixer = new THREE.AnimationMixer(memberModel);
        const actions = {
            idle: mixer.clipAction(this.clips.idle),
            run: mixer.clipAction(this.clips.run),
            shoot: mixer.clipAction(this.clips.shoot),
            win: mixer.clipAction(this.clips.win)
        };

        const initialAction = (this.isGameActive && !this.isLevelFinished) ? 'run' : (this.isLevelFinished ? 'win' : 'idle');
        actions[initialAction].play();
        mixer.setTime(Math.random() * 1.5);

        this.squad.push({
            model: memberModel,
            bones: bones,
            mixer: mixer,
            actions: actions,
            currentAction: initialAction,
            targetOffsetX: offsetX,
            targetOffsetZ: offsetZ
        });
    }

    recalculateSquadFormation() {
        const count = this.squad.length;
        const baseSpacing = Math.max(0.32, 0.48 - Math.min(0.18, count * 0.003));

        this.squad.forEach((member, i) => {
            if (i === 0) {
                member.targetOffsetX = 0;
                member.targetOffsetZ = 0;
                return;
            }

            const phi = i * 2.399963;
            const r = Math.sqrt(i) * baseSpacing;
            const spreadX = Math.cos(phi) * r * 0.85;
            const clampedX = THREE.MathUtils.clamp(spreadX, -1.8, 1.8);

            member.targetOffsetX = clampedX;
            member.targetOffsetZ = -Math.abs(Math.sin(phi) * r) * 0.95 - 0.20;
        });
    }

    // -----------------------------------------------------------------
    // ANIMATION CLIPS
    // -----------------------------------------------------------------
    createAnimationClips() {
        function rotateBone(baseQuat, axisX, axisY, axisZ, angle) {
            const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axisX, axisY, axisZ), angle);
            return baseQuat.clone().multiply(delta);
        }

        function rotateArm(baseQuat, lowerZ, swingX, yawY = 0) {
            const qL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), lowerZ);
            const qS = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swingX);
            const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawY);
            return baseQuat.clone().multiply(qL).multiply(qS).multiply(qY);
        }

        const Q = {
            thighL: new THREE.Quaternion(0.991726, -0.0000005, -0.000003, 0.128371),
            thighR: new THREE.Quaternion(0.991726, 0.0000003, 0.000003, 0.128371),
            shinL: new THREE.Quaternion(0.123721, 0.000402, -0.004173, 0.992308),
            shinR: new THREE.Quaternion(0.123721, -0.000402, 0.004173, 0.992308),
            footL: new THREE.Quaternion(-0.541576, -0.047592, -0.077637, 0.835704),
            footR: new THREE.Quaternion(-0.541576, 0.047592, 0.077637, 0.835704),
            spine: new THREE.Quaternion(-0.657343, 0, 0, 0.753591),
            spine1: new THREE.Quaternion(-0.030002, 0, 0, 0.999549),
            uaL: new THREE.Quaternion(0.155596, 0.757021, 0.002600, 0.634588),
            uaR: new THREE.Quaternion(0.155596, -0.757021, -0.002600, 0.634588),
            faL: new THREE.Quaternion(0.087055, -0.089008, 0.016195, 0.992087),
            faR: new THREE.Quaternion(0.087055, 0.089008, -0.016195, 0.992087)
        };

        // 1. IDLE CLIP
        const idleDuration = 1.4;
        const idleFrames = 9;
        const idleTimes = [];
        for (let i = 0; i < idleFrames; i++) idleTimes.push((i / (idleFrames - 1)) * idleDuration);
        const idleQuats = {
            'thighL.quaternion': [], 'thighR.quaternion': [],
            'shinL.quaternion': [], 'shinR.quaternion': [],
            'upper_armL.quaternion': [], 'upper_armR.quaternion': [],
            'forearmL.quaternion': [], 'forearmR.quaternion': [],
            'spine.quaternion': []
        };
        const idleSpinePos = [];
        idleTimes.forEach(t => {
            const breath = Math.sin((t / idleDuration) * Math.PI * 2) * 0.03;
            rotateBone(Q.thighL, 1, 0, 0, 0).toArray(idleQuats['thighL.quaternion'], idleQuats['thighL.quaternion'].length);
            rotateBone(Q.thighR, 1, 0, 0, 0).toArray(idleQuats['thighR.quaternion'], idleQuats['thighR.quaternion'].length);
            rotateBone(Q.shinL, 1, 0, 0, 0).toArray(idleQuats['shinL.quaternion'], idleQuats['shinL.quaternion'].length);
            rotateBone(Q.shinR, 1, 0, 0, 0).toArray(idleQuats['shinR.quaternion'], idleQuats['shinR.quaternion'].length);
            rotateArm(Q.uaL, -1.18, 0).toArray(idleQuats['upper_armL.quaternion'], idleQuats['upper_armL.quaternion'].length);
            rotateArm(Q.uaR, 1.18, 0).toArray(idleQuats['upper_armR.quaternion'], idleQuats['upper_armR.quaternion'].length);
            rotateBone(Q.faL, 1, 0, 0, 0.35 + breath).toArray(idleQuats['forearmL.quaternion'], idleQuats['forearmL.quaternion'].length);
            rotateBone(Q.faR, 1, 0, 0, 0.35 + breath).toArray(idleQuats['forearmR.quaternion'], idleQuats['forearmR.quaternion'].length);
            rotateBone(Q.spine, 1, 0, 0, 0.04 + breath).toArray(idleQuats['spine.quaternion'], idleQuats['spine.quaternion'].length);
            idleSpinePos.push(0, -0.0394 + breath * 0.5, -0.5765);
        });
        const idleTracks = [];
        for (const [k, v] of Object.entries(idleQuats)) idleTracks.push(new THREE.QuaternionKeyframeTrack(k, idleTimes, v));
        idleTracks.push(new THREE.VectorKeyframeTrack('spine.position', idleTimes, idleSpinePos));
        const clipIdle = new THREE.AnimationClip('idle', idleDuration, idleTracks);

        // 2. RUN CLIP
        const runDuration = 0.72;
        const runFrames = 13;
        const runTimes = [];
        for (let i = 0; i < runFrames; i++) runTimes.push((i / (runFrames - 1)) * runDuration);
        const runQuats = {
            'thighL.quaternion': [], 'thighR.quaternion': [],
            'shinL.quaternion': [], 'shinR.quaternion': [],
            'footL.quaternion': [], 'footR.quaternion': [],
            'upper_armL.quaternion': [], 'upper_armR.quaternion': [],
            'forearmL.quaternion': [], 'forearmR.quaternion': [],
            'spine.quaternion': [], 'spine001.quaternion': []
        };
        const runSpinePos = [];
        runTimes.forEach(t => {
            const phase = (t / runDuration) * Math.PI * 2;
            const swing = Math.sin(phase);
            rotateBone(Q.thighL, 1, 0, 0, -swing * 0.9).toArray(runQuats['thighL.quaternion'], runQuats['thighL.quaternion'].length);
            rotateBone(Q.thighR, 1, 0, 0, swing * 0.9).toArray(runQuats['thighR.quaternion'], runQuats['thighR.quaternion'].length);
            rotateBone(Q.shinL, 1, 0, 0, Math.max(0, swing * 1.55)).toArray(runQuats['shinL.quaternion'], runQuats['shinL.quaternion'].length);
            rotateBone(Q.shinR, 1, 0, 0, Math.max(0, -swing * 1.55)).toArray(runQuats['shinR.quaternion'], runQuats['shinR.quaternion'].length);
            rotateBone(Q.footL, 1, 0, 0, swing * 0.35).toArray(runQuats['footL.quaternion'], runQuats['footL.quaternion'].length);
            rotateBone(Q.footR, 1, 0, 0, -swing * 0.35).toArray(runQuats['footR.quaternion'], runQuats['footR.quaternion'].length);

            rotateArm(Q.uaL, -0.6, 0.75 + swing * 0.15).toArray(runQuats['upper_armL.quaternion'], runQuats['upper_armL.quaternion'].length);
            rotateArm(Q.uaR, 0.6, 0.85 - swing * 0.15).toArray(runQuats['upper_armR.quaternion'], runQuats['upper_armR.quaternion'].length);
            rotateBone(Q.faL, 1, 0, 0, 0.9).toArray(runQuats['forearmL.quaternion'], runQuats['forearmL.quaternion'].length);
            rotateBone(Q.faR, 1, 0, 0, 0.9).toArray(runQuats['forearmR.quaternion'], runQuats['forearmR.quaternion'].length);

            rotateBone(Q.spine, 1, 0, 0, 0.16).toArray(runQuats['spine.quaternion'], runQuats['spine.quaternion'].length);
            rotateBone(Q.spine1, 0, 1, 0, swing * 0.1).toArray(runQuats['spine001.quaternion'], runQuats['spine001.quaternion'].length);
            runSpinePos.push(0, -0.0394 + Math.abs(swing) * 0.08, -0.5765);
        });
        const runTracks = [];
        for (const [k, v] of Object.entries(runQuats)) runTracks.push(new THREE.QuaternionKeyframeTrack(k, runTimes, v));
        runTracks.push(new THREE.VectorKeyframeTrack('spine.position', runTimes, runSpinePos));
        const clipRun = new THREE.AnimationClip('run', runDuration, runTracks);

        // 3. WIN CLIP
        const winDuration = 1.0;
        const winFrames = 9;
        const winTimes = [];
        for (let i = 0; i < winFrames; i++) winTimes.push((i / (winFrames - 1)) * winDuration);
        const winQuats = {
            'thighL.quaternion': [], 'thighR.quaternion': [],
            'shinL.quaternion': [], 'shinR.quaternion': [],
            'upper_armL.quaternion': [], 'upper_armR.quaternion': [],
            'forearmL.quaternion': [], 'forearmR.quaternion': [],
            'spine.quaternion': []
        };
        const winSpinePos = [];
        winTimes.forEach(t => {
            const jump = Math.sin((t / winDuration) * Math.PI * 2);
            rotateBone(Q.thighL, 1, 0, 0, 0.1).toArray(winQuats['thighL.quaternion'], winQuats['thighL.quaternion'].length);
            rotateBone(Q.thighR, 1, 0, 0, 0.1).toArray(winQuats['thighR.quaternion'], winQuats['thighR.quaternion'].length);
            rotateBone(Q.shinL, 1, 0, 0, 0.2).toArray(winQuats['shinL.quaternion'], winQuats['shinL.quaternion'].length);
            rotateBone(Q.shinR, 1, 0, 0, 0.2).toArray(winQuats['shinR.quaternion'], winQuats['shinR.quaternion'].length);
            rotateArm(Q.uaL, 0.8, 0.3 + jump * 0.3).toArray(winQuats['upper_armL.quaternion'], winQuats['upper_armL.quaternion'].length);
            rotateArm(Q.uaR, -0.8, 0.3 + jump * 0.3).toArray(winQuats['upper_armR.quaternion'], winQuats['upper_armR.quaternion'].length);
            rotateBone(Q.faL, 1, 0, 0, 0.3).toArray(winQuats['forearmL.quaternion'], winQuats['forearmL.quaternion'].length);
            rotateBone(Q.faR, 1, 0, 0, 0.3).toArray(winQuats['forearmR.quaternion'], winQuats['forearmR.quaternion'].length);
            rotateBone(Q.spine, 1, 0, 0, -0.05).toArray(winQuats['spine.quaternion'], winQuats['spine.quaternion'].length);
            winSpinePos.push(0, -0.0394 + Math.max(0, jump) * 0.25, -0.5765);
        });
        const winTracks = [];
        for (const [k, v] of Object.entries(winQuats)) winTracks.push(new THREE.QuaternionKeyframeTrack(k, winTimes, v));
        winTracks.push(new THREE.VectorKeyframeTrack('spine.position', winTimes, winSpinePos));
        const clipWin = new THREE.AnimationClip('win', winDuration, winTracks);

        return { idle: clipIdle, run: clipRun, shoot: clipRun, win: clipWin };
    }

    // -----------------------------------------------------------------
    // INPUT CONTROLS
    // -----------------------------------------------------------------
    setupEventListeners() {
        let isDragging = false;
        let startPointerX = 0;
        let startPlayerX = 0;

        const onPointerDown = (e) => {
            isDragging = true;
            startPointerX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            startPlayerX = this.playerX;
            this.isGameActive = true;
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            const deltaX = (clientX - startPointerX) / (this.width * 0.35);
            this.targetPlayerX = THREE.MathUtils.clamp(startPlayerX - deltaX * 3.8, this.minPlayerX, this.maxPlayerX);
        };

        const onPointerUp = () => {
            isDragging = false;
        };

        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        window.addEventListener('touchstart', onPointerDown, { passive: true });
        window.addEventListener('touchmove', onPointerMove, { passive: true });
        window.addEventListener('touchend', onPointerUp, { passive: true });

        window.addEventListener('resize', () => {
            this.width = this.container.clientWidth || window.innerWidth;
            this.height = this.container.clientHeight || window.innerHeight;
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.width, this.height);
        });
    }

    createRocketBulletMesh(isGolden = false) {
        const group = new THREE.Group();

        const tipColor = isGolden ? 0xf59e0b : 0x2563eb;    // Blue nose cone (Gold when upgraded)
        const bodyColor = isGolden ? 0xfacc15 : 0xeab308;   // Yellow fuselage
        const bandColor = isGolden ? 0xd97706 : 0x1d4ed8;   // Rear band
        const finColor = isGolden ? 0xf59e0b : 0xf97316;    // Orange stabilizer fins

        const tipMat = new THREE.MeshBasicMaterial({ color: tipColor });
        const bodyMat = new THREE.MeshBasicMaterial({ color: bodyColor });
        const bandMat = new THREE.MeshBasicMaterial({ color: bandColor });
        const finMat = new THREE.MeshBasicMaterial({ color: finColor });

        // Pointed Nose Cone (facing forward +Z)
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), tipMat);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 0.35);
        group.add(nose);

        // Yellow Middle Fuselage
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.38, 8), bodyMat);
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0, 0.0);
        group.add(body);

        // Rear Nozzle Band
        const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.24, 8), bandMat);
        rear.rotation.x = Math.PI / 2;
        rear.position.set(0, 0, -0.28);
        group.add(rear);

        // 4 Angled Tail Fins matching Weapon_1.webp
        const finGeo = new THREE.BoxGeometry(0.03, 0.28, 0.22);

        const finV = new THREE.Mesh(finGeo, finMat);
        finV.position.set(0, 0, -0.26);
        group.add(finV);

        const finH = new THREE.Mesh(finGeo, finMat);
        finH.rotation.z = Math.PI / 2;
        finH.position.set(0, 0, -0.26);
        group.add(finH);

        group.scale.set(1.18, 1.18, 1.18);

        return group;
    }

    spawnBullet(originX, originZ) {
        const isGolden = (this.bulletColor === 0xfacc15);
        const bulletMesh = this.createRocketBulletMesh(isGolden);
        bulletMesh.position.set(originX, 0.62, originZ);

        this.scene.add(bulletMesh);
        this.bullets.push({
            mesh: bulletMesh,
            speed: 68,
            damage: this.bulletPower,
            life: 0.8 // Half lifetime for half range
        });

        this.onShoot();
    }

    updateBullets(delta) {
        if (this.isGameActive && !this.isLevelFinished) {
            this.fireTimer += delta;
            if (this.fireTimer >= this.fireInterval) {
                this.fireTimer = 0;
                // Fire from squad runners!
                const squadCount = this.squad.length;
                const maxStreams = Math.min(36, squadCount);
                for (let i = 0; i < maxStreams; i++) {
                    const runner = this.squad[i];
                    if (runner && runner.model) {
                        this.spawnBullet(runner.model.position.x + 0.14, runner.model.position.z + 0.60);
                    }
                }
            }
        }

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.life -= delta;
            b.mesh.position.z += b.speed * delta;

            let bulletRemoved = false;

            // 1. Boxes collision (Stationary Box 3 uses localZ, moving boxes use localZ - distanceTravelled)
            for (let k = 0; k < this.boxObstacles.length; k++) {
                const box = this.boxObstacles[k];
                if (box.isDestroyed) continue;

                const worldBoxZ = box.isStationary ? box.localZ : (box.localZ - this.distanceTravelled);
                const dz = worldBoxZ - b.mesh.position.z;
                const dx = Math.abs(box.localX - b.mesh.position.x);

                if (dz > -0.5 && dz < 1.2 && dx < box.width / 2 + 0.2) {
                    box.hp -= b.damage;
                    box.onHit(b.damage);
                    this.spawnSparkBurst(b.mesh.position.x, 1.2, b.mesh.position.z);
                    this.spawnFloatingDamageText(box.localX + (Math.random() - 0.5) * 0.6, 2.2, worldBoxZ - 0.5, `-${Math.ceil(b.damage)}`);

                    if (box.hp <= 0) {
                        box.isDestroyed = true;
                        box.onDestroy();
                        this.onCoinCollect({ amount: 300 });
                    }

                    this.scene.remove(b.mesh);
                    this.bullets.splice(i, 1);
                    bulletRemoved = true;
                    break;
                }
            }
            if (bulletRemoved) continue;

            // 2. Red Minions Horde collision
            for (let k = 0; k < this.redMinions.length; k++) {
                const minion = this.redMinions[k];
                if (minion.isDestroyed) continue;

                const worldMinionZ = minion.localZ - this.distanceTravelled;
                const dz = worldMinionZ - b.mesh.position.z;
                const dx = Math.abs(minion.localX - b.mesh.position.x);

                if (dz > -0.4 && dz < 1.0 && dx < 0.45) {
                    minion.hp -= b.damage;
                    this.spawnSparkBurst(b.mesh.position.x, 1.0, b.mesh.position.z);

                    if (minion.hp <= 0) {
                        for (let p = 0; p < 12; p++) {
                            this.spawnSparkParticle(minion.localX, 0.9, worldMinionZ, 0xdc2626);
                        }
                        this.onCoinCollect({ amount: 50 });

                        // Endless horde: respawn minion in front of the boss if boss is alive
                        if (!this.finalBoss || !this.finalBoss.isDestroyed) {
                            const bossDist = Math.max(10, this.finalBoss.localZ - this.distanceTravelled - 8);
                            minion.localZ = this.distanceTravelled + 35 + Math.random() * (bossDist - 5);
                            minion.baseLocalX = -2.35 + Math.random() * 3.55;
                            minion.localX = minion.baseLocalX;
                            minion.group.position.x = minion.localX;
                            minion.group.position.z = minion.localZ;
                            minion.hp = minion.maxHp;
                            minion.isDestroyed = false;
                            minion.group.visible = true;
                        }
                    }

                    this.scene.remove(b.mesh);
                    this.bullets.splice(i, 1);
                    bulletRemoved = true;
                    break;
                }
            }
            if (bulletRemoved) continue;

            // 3. Left lane +1 booster gates (moves only when Box 3 is destroyed)
            for (let k = 0; k < this.leftGates.length; k++) {
                const lg = this.leftGates[k];
                const worldGateZ = this.isBox23Destroyed ? (lg.localZ - this.leftGatesDistance) : lg.localZ;
                const dz = worldGateZ - b.mesh.position.z;
                const dx = Math.abs(lg.localX - b.mesh.position.x);

                if (dz > -0.4 && dz < 0.8 && dx < lg.width / 2) {
                    lg.onHitBullet();
                    b.damage += 0.25;
                }
            }

            // 4. Giant Red Boss collision
            if (this.finalBoss && !this.finalBoss.isDestroyed) {
                const boss = this.finalBoss;
                const worldBossZ = boss.localZ - this.distanceTravelled;
                const dz = worldBossZ - b.mesh.position.z;
                const dx = Math.abs(boss.localX - b.mesh.position.x);

                if (dz > -0.8 && dz < 2.4 && dx < 2.5) {
                    boss.hp -= b.damage;

                    if (boss.hpBarMesh) {
                        const ratio = Math.max(0, boss.hp / boss.maxHp);
                        boss.hpBarMesh.scale.x = ratio;
                    }

                    this.spawnSparkBurst(b.mesh.position.x, 1.8 + Math.random() * 1.5, b.mesh.position.z);
                    this.spawnFloatingDamageText(boss.localX + (Math.random() - 0.5) * 1.6, 3.2, worldBossZ, `-${Math.ceil(b.damage)}`);

                    if (boss.hp <= 0) {
                        boss.isDestroyed = true;
                        boss.group.visible = false;

                        for (let p = 0; p < 60; p++) {
                            this.spawnSparkParticle(boss.localX + (Math.random() - 0.5) * 3, 2.0 + Math.random() * 2, worldBossZ, 0xfacc15);
                        }

                        // Wipe out ALL remaining red enemies immediately!
                        this.redMinions.forEach(m => {
                            if (!m.isDestroyed) {
                                m.isDestroyed = true;
                                m.group.visible = false;
                                const wZ = m.localZ - this.distanceTravelled;
                                for (let p = 0; p < 4; p++) {
                                    this.spawnSparkParticle(m.localX, 0.9, wZ, 0xdc2626);
                                }
                            }
                        });

                        this.onCoinCollect({ amount: 5000 });

                        // Trigger Victory on Boss defeat!
                        this.isLevelFinished = true;
                        this.isGameActive = false;
                        this.onLevelComplete();
                    }

                    this.scene.remove(b.mesh);
                    this.bullets.splice(i, 1);
                    continue;
                }
            }

            if (b.life <= 0 || b.mesh.position.z > this.playerZ + 35) {
                this.scene.remove(b.mesh);
                this.bullets.splice(i, 1);
            }
        }
    }

    // -----------------------------------------------------------------
    // MAIN LOOP
    // -----------------------------------------------------------------
    update() {
        const delta = Math.min(this.clock.getDelta(), 0.1);
        this.animTime += delta;

        // Animate floating weapon bobbing
        this.floatingWeapons.forEach(fw => {
            if (fw.model && fw.parentBox && fw.parentBox.visible) {
                fw.model.position.y = fw.baseY + Math.sin(this.animTime * 3.0) * 0.15;
                fw.model.rotation.y = Math.PI / 2 + Math.sin(this.animTime * 2.0) * 0.2;
            }
        });

        if (this.isGameActive && !this.isLevelFinished) {
            // Right lane objects move continuously
            this.distanceTravelled += this.worldSpeed * delta;
            this.rightLaneGroup.position.z = -this.distanceTravelled;

            // Left lane +1 gates move rapidly ONLY after Box 3 is destroyed!
            if (this.isBox23Destroyed) {
                this.leftGatesDistance += this.leftGatesSpeed * delta;
                this.leftGatesGroup.position.z = -this.leftGatesDistance;
            } else {
                this.leftGatesGroup.position.z = 0;
            }

            // Player moves horizontally
            this.playerX += (this.targetPlayerX - this.playerX) * 12 * delta;
            this.playerX = THREE.MathUtils.clamp(this.playerX, this.minPlayerX, this.maxPlayerX);

            const progress = THREE.MathUtils.clamp(this.distanceTravelled / this.totalTrackLength, 0, 1);
            this.onProgress(progress);

            // Gate, Enemy, and Box collision checks
            this.checkGateCollisions();
            this.checkEnemyCollisions();
            this.checkBoxObstacleCollisions();

            if (this.distanceTravelled >= this.totalTrackLength) {
                this.isLevelFinished = true;
                this.isGameActive = false;
                this.onLevelComplete();
            }
        }

        // Update red minions with dynamic chaotic swarm motion & animation mixers
        this.redMinions.forEach(m => {
            if (m.isDestroyed) return;

            if (this.isGameActive && !this.isLevelFinished) {
                // Dynamic chaotic jostling & forward surge
                m.localX = THREE.MathUtils.clamp(
                    m.baseLocalX + Math.sin(this.animTime * m.wobbleSpeed + m.wobblePhase) * m.wobbleAmp,
                    -2.40,
                    3.10
                );
                m.localZ += m.driftSpeed * delta * 0.35;
                m.group.position.x = m.localX;
                m.group.position.z = m.localZ;
                m.group.rotation.y = Math.PI + m.rotOffset + Math.cos(this.animTime * m.wobbleSpeed + m.wobblePhase) * 0.12;
            }

            if (m.mixer) {
                m.mixer.update(delta);
            }
        });
        if (this.finalBoss && this.finalBoss.mixer) {
            this.finalBoss.mixer.update(delta);
        }

        this.updateBullets(delta);
        this.updateSquadMembers(delta);
        this.updateDebrisAndParticles(delta);

        this.renderer.render(this.scene, this.camera);
    }

    checkGateCollisions() {
        // Main Gates
        this.gates.forEach(g => {
            if (g.isPassed) return;
            const worldGateZ = g.localZ - this.distanceTravelled;

            // When gate reaches player
            if (worldGateZ < this.playerZ + 1.2 && worldGateZ > this.playerZ - 1.2) {
                const dx = this.playerX - g.localX;
                if (Math.abs(dx) < g.width / 2) {
                    g.isPassed = true;
                    g.onPass();
                }
            }
        });

        // Left +1 booster gates (infinite continuous stream when Box 3 is destroyed)
        this.leftGates.forEach(lg => {
            const worldGateZ = this.isBox23Destroyed ? (lg.localZ - this.leftGatesDistance) : lg.localZ;

            if (!lg.isTriggered && worldGateZ < this.playerZ + 1.2 && worldGateZ > this.playerZ - 1.2) {
                const dx = this.playerX - lg.localX;
                if (Math.abs(dx) < lg.width / 2 + 0.6) {
                    lg.isTriggered = true;
                    lg.onPassPlayer();
                    lg.group.visible = false;
                }
            }

            // Recycle gate to the back to maintain an infinite endless stream
            if (this.isBox23Destroyed && worldGateZ < this.playerZ - 5.0) {
                lg.localZ += 240;
                lg.group.position.z = lg.localZ;
                lg.isTriggered = false;
                lg.group.visible = true;
            }
        });
    }

    checkEnemyCollisions() {
        this.redMinions.forEach(minion => {
            if (minion.isDestroyed) return;
            const worldMinionZ = minion.localZ - this.distanceTravelled;

            // When minion passes the player line
            if (worldMinionZ <= this.playerZ + 0.6) {
                this.removeRunnersFromSquad(1);
                this.onHit({ type: 'enemy', damage: 1 });

                for (let p = 0; p < 15; p++) {
                    this.spawnSparkParticle(minion.localX, 1.0, this.playerZ, 0xdc2626);
                }

                // Endless horde: respawn minion in front of the boss if boss is alive
                if (!this.finalBoss || !this.finalBoss.isDestroyed) {
                    const bossDist = Math.max(10, this.finalBoss.localZ - this.distanceTravelled - 8);
                    minion.localZ = this.distanceTravelled + 35 + Math.random() * (bossDist - 5);
                    minion.baseLocalX = -2.35 + Math.random() * 3.55;
                    minion.localX = minion.baseLocalX;
                    minion.group.position.x = minion.localX;
                    minion.group.position.z = minion.localZ;
                    minion.hp = minion.maxHp;
                    minion.isDestroyed = false;
                    minion.group.visible = true;
                } else {
                    minion.isDestroyed = true;
                    minion.group.visible = false;
                }
            }
        });

        // Boss collision with squad
        if (this.finalBoss && !this.finalBoss.isDestroyed) {
            const worldBossZ = this.finalBoss.localZ - this.distanceTravelled;
            if (worldBossZ <= this.playerZ + 1.8) {
                const loss = Math.min(this.squad.length, 3);
                this.removeRunnersFromSquad(loss);
                this.onHit({ type: 'boss', damage: loss });
                for (let p = 0; p < 20; p++) {
                    this.spawnSparkParticle(this.finalBoss.localX, 1.5, this.playerZ, 0xef4444);
                }
            }
        }
    }

    checkBoxObstacleCollisions() {
        this.boxObstacles.forEach(box => {
            if (box.isDestroyed || box.isStationary) return;
            const worldBoxZ = box.localZ - this.distanceTravelled;

            // When moving box passes the player line
            if (worldBoxZ <= this.playerZ + 0.6) {
                box.isDestroyed = true;
                box.onDestroy();

                const lossCount = Math.max(1, Math.ceil(box.hp));
                this.removeRunnersFromSquad(lossCount);
                this.onHit({ type: 'box', damage: lossCount });
            }
        });
    }

    removeRunnersFromSquad(count) {
        const toRemove = Math.min(count, this.squad.length);
        for (let i = 0; i < toRemove; i++) {
            const member = this.squad.pop();
            if (member) {
                this.spawnDebris(member.model.position, false);
                this.scene.remove(member.model);
            }
        }

        if (this.squad.length === 0) {
            this.isLevelFinished = true;
            this.isGameActive = false;
            setTimeout(() => {
                this.onLevelComplete();
            }, 600);
        } else {
            this.recalculateSquadFormation();
        }
        this.onSquadCountChange(this.squad.length);
    }

    updateSquadMembers(delta) {
        const isRunning = this.isGameActive && !this.isLevelFinished;
        const turnTilt = (this.targetPlayerX - this.playerX) * 0.14;

        let targetActionName = 'idle';
        if (this.isLevelFinished) {
            targetActionName = 'win';
        } else if (isRunning) {
            targetActionName = 'run';
        }

        const roadMinX = -2.40;
        const roadMaxX = 3.10;

        this.squad.forEach((member) => {
            let curOffsetX = member.targetOffsetX;
            let curOffsetZ = member.targetOffsetZ;

            // Auto-compress (tự dồn lại) squad when hitting left or right railings
            const projectedX = this.playerX + curOffsetX;
            if (projectedX < roadMinX) {
                const overflow = roadMinX - projectedX;
                curOffsetX += overflow; // Push back inwards towards road
                curOffsetZ -= Math.abs(overflow) * 0.45; // Squeeze backward in crowd
            } else if (projectedX > roadMaxX) {
                const overflow = projectedX - roadMaxX;
                curOffsetX -= overflow; // Push back inwards towards road
                curOffsetZ -= Math.abs(overflow) * 0.45; // Squeeze backward in crowd
            }

            const targetX = THREE.MathUtils.clamp(this.playerX + curOffsetX, roadMinX, roadMaxX);
            const targetZ = this.playerZ + curOffsetZ;

            member.model.position.x += (targetX - member.model.position.x) * 16 * delta;
            member.model.position.z += (targetZ - member.model.position.z) * 16 * delta;

            member.model.rotation.z = -turnTilt;
            member.model.rotation.y = turnTilt * 0.7;

            if (this.isLevelFinished) {
                member.model.rotation.y = Math.PI * 0.85;
            }

            if (member.currentAction !== targetActionName) {
                const prev = member.actions[member.currentAction];
                const next = member.actions[targetActionName];
                if (prev && next) {
                    prev.fadeOut(0.14);
                    next.reset().fadeIn(0.14).play();
                }
                member.currentAction = targetActionName;
            }

            if (member.mixer) {
                member.mixer.update(delta);
            }
        });
    }

    spawnSparkBurst(x, y, z, color = null) {
        const c = color || this.bulletColor || 0x38bdf8;
        for (let i = 0; i < 7; i++) {
            this.spawnSparkParticle(x, y, z, c);
        }
    }

    spawnSparkParticle(x, y, z, color = 0x38bdf8) {
        const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const pMat = new THREE.MeshBasicMaterial({ color: color });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);

        this.scene.add(pMesh);
        this.particlesList.push({
            mesh: pMesh,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() * 5 + 2),
            vz: (Math.random() - 0.5) * 6,
            life: 0.5,
            maxLife: 0.5
        });
    }

    spawnFloatingDamageText(x, y, z, text) {
        const sprite = this.createTextSprite(text, {
            fontSize: 54,
            textColor: '#ffffff',
            strokeColor: '#000000',
            strokeWidth: 9
        });
        sprite.position.set(x, y, z);
        sprite.scale.set(1.4, 0.7, 1);

        this.scene.add(sprite);
        this.floatingTexts.push({
            sprite: sprite,
            vy: 3.0,
            life: 0.75,
            maxLife: 0.75
        });
    }

    updateDebrisAndParticles(delta) {
        const gravity = -18.0;

        for (let i = this.debrisList.length - 1; i >= 0; i--) {
            const d = this.debrisList[i];
            d.life -= delta;
            d.vy += gravity * delta;

            d.mesh.position.x += d.vx * delta;
            d.mesh.position.y += d.vy * delta;
            d.mesh.position.z += d.vz * delta;
            d.mesh.rotation.x += d.rotV * delta;
            d.mesh.rotation.y += d.rotV * delta;

            if (d.mesh.position.y < 0.1) {
                d.mesh.position.y = 0.1;
                d.vy = -d.vy * 0.35;
                d.vx *= 0.7;
                d.vz *= 0.7;
            }

            if (d.life <= 0) {
                this.scene.remove(d.mesh);
                this.debrisList.splice(i, 1);
            }
        }

        for (let i = this.particlesList.length - 1; i >= 0; i--) {
            const p = this.particlesList[i];
            p.life -= delta;
            p.vy += (gravity * 0.6) * delta;
            p.mesh.position.x += p.vx * delta;
            p.mesh.position.y += p.vy * delta;
            p.mesh.position.z += p.vz * delta;

            const scale = Math.max(0, p.life / p.maxLife);
            p.mesh.scale.set(scale, scale, scale);

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particlesList.splice(i, 1);
            }
        }

        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.life -= delta;
            ft.sprite.position.y += ft.vy * delta;

            const scale = Math.max(0, ft.life / ft.maxLife) * 1.4;
            ft.sprite.scale.set(scale, scale * 0.5, 1);

            if (ft.life <= 0) {
                this.scene.remove(ft.sprite);
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    createTextSprite(text, options = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = options.width || 512;
        canvas.height = options.height || 128;
        const ctx = canvas.getContext('2d');

        this.renderTextOnCanvas(ctx, canvas.width, canvas.height, text, options);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.renderOrder = 999;
        sprite.userData = { canvas: canvas, ctx: ctx, texture: texture, options: options };
        return sprite;
    }

    renderTextOnCanvas(ctx, w, h, text, options) {
        ctx.clearRect(0, 0, w, h);
        const fontSize = options.fontSize || 48;
        ctx.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (options.strokeWidth) {
            ctx.lineWidth = options.strokeWidth;
            ctx.strokeStyle = options.strokeColor || '#000000';
            ctx.lineJoin = 'round';
            ctx.strokeText(text, w / 2, h / 2);
        }

        ctx.fillStyle = options.textColor || '#ffffff';
        ctx.fillText(text, w / 2, h / 2);
    }
}
