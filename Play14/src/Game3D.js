import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import skinModelUrl from './assets/Model/Skin_BF14.glb';

export class Game3D {
    constructor(container, options = {}) {
        this.container = container;
        this.onHit = options.onHit || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onSquadCountChange = options.onSquadCountChange || (() => {});
        this.onLevelComplete = options.onLevelComplete || (() => {});
        this.onCoinCollect = options.onCoinCollect || (() => {});

        this.width = container.clientWidth || window.innerWidth;
        this.height = container.clientHeight || window.innerHeight;

        this.isGameActive = false;
        this.isLevelFinished = false;

        // Position on the GREEN TRACK (Green track is centered at x = -1.2, spans x = -4.8 to +2.4)
        this.playerX = -1.2;
        this.targetPlayerX = -1.2;
        this.minPlayerX = -4.2; // Rightmost boundary on green track
        this.maxPlayerX = 1.6;  // Leftmost boundary on green track (cannot step on red track)
        this.playerZ = 0;
        this.playerSpeed = 15.5;
        this.totalTrackLength = 225;

        // Squad members (instances of Skin_BF14)
        this.squad = [];
        this.basePlayerModel = null;
        this.modelLoaded = false;

        // Debris & Particles & Floating Numbers
        this.debrisList = [];
        this.particlesList = [];
        this.floatingTexts = [];

        // Obstacles & Gates
        this.obstacles = [];
        this.gates = [];

        // Clock & Animation timing
        this.clock = new THREE.Clock();
        this.animTime = 0;
        this.hitCooldown = 0;

        this.initThree();
        this.createEnvironment();
        this.createTrack();
        this.createLevelCourse();
        this.loadPlayerModel();
        this.setupEventListeners();
    }

    initThree() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xd7d0c3);
        this.scene.fog = new THREE.Fog(0xd7d0c3, 50, 230);

        // Camera
        this.camera = new THREE.PerspectiveCamera(48, this.width / this.height, 0.1, 350);
        this.cameraOffset = new THREE.Vector3(0, 5.8, -9.2);
        this.cameraLookOffset = new THREE.Vector3(0, 1.5, 9.0);
        this.camera.position.set(-1.2, 5.8, -9.2);

        // WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;

        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.zIndex = '1';
        this.container.appendChild(this.renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xfffaed, 0x88aa77, 0.45);
        this.scene.add(hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xfff3db, 1.3);
        this.dirLight.position.set(-16, 32, -15);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 130;
        this.dirLight.shadow.camera.left = -22;
        this.dirLight.shadow.camera.right = 22;
        this.dirLight.shadow.camera.top = 28;
        this.dirLight.shadow.camera.bottom = -28;
        this.dirLight.shadow.bias = -0.0004;
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);
    }

    createEnvironment() {
        const groundGeo = new THREE.PlaneGeometry(300, 500);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0xc8ddb8 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.05, 120);
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createTrack() {
        const trackLength = this.totalTrackLength + 40;
        this.trackGroup = new THREE.Group();

        // 1. LEFT Athletic Running Track (Red track on screen-left side)
        const redMat = new THREE.MeshLambertMaterial({ color: 0xd64843 });
        const redTrackGeo = new THREE.PlaneGeometry(2.8, trackLength);
        const redTrack = new THREE.Mesh(redTrackGeo, redMat);
        redTrack.rotation.x = -Math.PI / 2;
        redTrack.position.set(3.8, 0.01, trackLength / 2 - 10);
        redTrack.receiveShadow = true;
        this.trackGroup.add(redTrack);

        // White lane stripes on red track (screen-left)
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        [4.7, 3.8, 2.9].forEach(lx => {
            const lineGeo = new THREE.PlaneGeometry(0.1, trackLength);
            const lineMesh = new THREE.Mesh(lineGeo, lineMat);
            lineMesh.rotation.x = -Math.PI / 2;
            lineMesh.position.set(lx, 0.02, trackLength / 2 - 10);
            this.trackGroup.add(lineMesh);
        });

        // 2. RIGHT/CENTER Green Runway (Where player runs and interacts)
        const segLen = 8;
        const numSegs = Math.ceil(trackLength / segLen);
        const green1 = new THREE.MeshLambertMaterial({ color: 0x62af63 });
        const green2 = new THREE.MeshLambertMaterial({ color: 0x7ecc7e });

        for (let i = 0; i < numSegs; i++) {
            const mat = (i % 2 === 0) ? green1 : green2;
            const geo = new THREE.PlaneGeometry(7.2, segLen);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(-1.2, 0, i * segLen + segLen / 2 - 10);
            mesh.receiveShadow = true;
            this.trackGroup.add(mesh);
        }

        // 3. Side Railings & Floating Soccer Balls
        this.createSideRailings(trackLength);
        this.createFloatingSoccerBalls();

        this.scene.add(this.trackGroup);
    }

    createSideRailings(trackLength) {
        const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8);
        const railGeo = new THREE.CylinderGeometry(0.05, 0.05, trackLength, 8);
        const fenceMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });

        // Left outer rail (x = 5.3) and Right outer rail (x = -4.9)
        [5.3, -4.9].forEach(rx => {
            const topRail = new THREE.Mesh(railGeo, fenceMat);
            topRail.rotation.x = Math.PI / 2;
            topRail.position.set(rx, 0.9, trackLength / 2 - 10);
            topRail.castShadow = true;
            this.trackGroup.add(topRail);

            const midRail = new THREE.Mesh(railGeo, fenceMat);
            midRail.rotation.x = Math.PI / 2;
            midRail.position.set(rx, 0.45, trackLength / 2 - 10);
            midRail.castShadow = true;
            this.trackGroup.add(midRail);

            for (let z = -10; z < trackLength; z += 4.5) {
                const post = new THREE.Mesh(postGeo, fenceMat);
                post.position.set(rx, 0.55, z);
                post.castShadow = true;
                post.receiveShadow = true;
                this.trackGroup.add(post);
            }
        });
    }

    createFloatingSoccerBalls() {
        this.floatingBalls = [];
        const ballPositions = [
            { x: 6.8, z: 28, y: 3.8 },
            { x: -6.2, z: 32, y: 3.8 },
            { x: 6.8, z: 78, y: 3.8 },
            { x: -6.2, z: 84, y: 3.8 },
            { x: 6.8, z: 128, y: 3.8 },
            { x: -6.2, z: 135, y: 3.8 },
            { x: 6.8, z: 178, y: 3.8 },
            { x: -6.2, z: 186, y: 3.8 }
        ];

        const ballTexture = this.generateSoccerTexture();
        const ballMat = new THREE.MeshStandardMaterial({
            map: ballTexture,
            roughness: 0.35,
            metalness: 0.05
        });
        const ballGeo = new THREE.SphereGeometry(1.35, 24, 24);

        ballPositions.forEach((pos, idx) => {
            const ball = new THREE.Mesh(ballGeo, ballMat);
            ball.position.set(pos.x, pos.y, pos.z);
            ball.castShadow = true;
            ball.userData = {
                baseY: pos.y,
                seed: idx * 1.5,
                rotSpeedX: 0.015 + (idx % 3) * 0.005,
                rotSpeedY: 0.02 + (idx % 2) * 0.008
            };
            this.scene.add(ball);
            this.floatingBalls.push(ball);
        });
    }

    generateSoccerTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, 512, 256);
        ctx.fillStyle = '#1e782d';
        const hexRadius = 38;

        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 10; col++) {
                if ((row + col) % 2 === 0) {
                    const cx = col * 56 + (row % 2) * 28;
                    const cy = row * 48;
                    this.drawPolygon(ctx, cx, cy, hexRadius, 5);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    drawPolygon(ctx, x, y, radius, sides) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
            const px = x + radius * Math.cos(angle);
            const py = y + radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }

    // -----------------------------------------------------------------
    // LEVEL COURSE: Only Stone Columns & Character Multiplier Gates
    // -----------------------------------------------------------------
    createLevelCourse() {
        // 1. First Gate Choice (Z = 32): Left +3 vs Right +5
        this.createGatePair(32, { type: 'add', val: 3, label: '+3' }, { type: 'add', val: 5, label: '+5' });

        // 2. First Stone Cylinder Pillar (Z = 65) - centered on green track (x = -1.2)
        const pillar1 = this.createStoneCylinderTower({
            x: -1.2,
            z: 65,
            radius: 2.0,
            height: 3.6,
            maxHp: 45,
            id: 'pillar_1'
        });
        this.obstacles.push(pillar1);

        // 3. Second Gate Choice (Z = 105): Left x2 vs Right +10
        this.createGatePair(105, { type: 'mult', val: 2, label: 'x2' }, { type: 'add', val: 10, label: '+10' });

        // 4. Second Stone Cylinder Pillar (Z = 145) - centered on green track (x = -1.2)
        const pillar2 = this.createStoneCylinderTower({
            x: -1.2,
            z: 145,
            radius: 2.2,
            height: 3.8,
            maxHp: 80,
            id: 'pillar_2'
        });
        this.obstacles.push(pillar2);

        // 5. Third Gate Choice (Z = 175): Left +15 vs Right x3
        this.createGatePair(175, { type: 'add', val: 15, label: '+15' }, { type: 'mult', val: 3, label: 'x3' });

        // 6. Final Mega Stone Column (Z = 200) - centered on green track (x = -1.2)
        const pillar3 = this.createStoneCylinderTower({
            x: -1.2,
            z: 200,
            radius: 2.5,
            height: 4.2,
            maxHp: 120,
            id: 'pillar_3'
        });
        this.obstacles.push(pillar3);

        // 7. Finish Line Stage (Z = 220) - centered on green track (x = -1.2)
        this.createFinishStage(220);
    }

    createGatePair(z, leftData, rightData) {
        // Left Gate (x = 0.4, spans x = -1.1 to +1.9)
        const gLeft = this.createMultiplierGate(0.4, z, leftData);
        this.gates.push(gLeft);

        // Right Gate (x = -2.8, spans x = -4.3 to -1.3)
        const gRight = this.createMultiplierGate(-2.8, z, rightData);
        this.gates.push(gRight);
    }

    createMultiplierGate(x, z, data) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const isMult = data.type === 'mult';
        
        // Colors: Vibrant Blue for Addition, Vibrant Green for Multiplier
        const themeColor = isMult ? 0x10b981 : 0x0284c7;
        const energyColor = isMult ? 0x34d399 : 0x38bdf8;
        const gateMat = new THREE.MeshStandardMaterial({ color: themeColor, roughness: 0.25, metalness: 0.3 });

        const width = 3.2;
        const height = 4.2;

        // Left post
        const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, height, 16), gateMat);
        p1.position.set(-width / 2 + 0.12, height / 2, 0);
        p1.castShadow = true;
        group.add(p1);

        // Right post
        const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, height, 16), gateMat);
        p2.position.set(width / 2 - 0.12, height / 2, 0);
        p2.castShadow = true;
        group.add(p2);

        // Top arch
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, 0.4), gateMat);
        topBar.position.set(0, height + 0.1, 0);
        topBar.castShadow = true;
        group.add(topBar);

        // Translucent Energy Field
        const energyMat = new THREE.MeshBasicMaterial({
            color: energyColor,
            transparent: true,
            opacity: 0.38,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const energyMesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.25, height - 0.3), energyMat);
        energyMesh.position.set(0, (height - 0.3) / 2, 0);
        group.add(energyMesh);

        // --- HIGH-VISIBILITY 3D NUMBER BOARD ---
        const boardCanvas = document.createElement('canvas');
        boardCanvas.width = 512;
        boardCanvas.height = 384;
        const bctx = boardCanvas.getContext('2d');

        bctx.clearRect(0, 0, 512, 384);

        const bgGrad = bctx.createLinearGradient(0, 40, 0, 340);
        if (isMult) {
            bgGrad.addColorStop(0, '#059669');
            bgGrad.addColorStop(1, '#047857');
        } else {
            bgGrad.addColorStop(0, '#0284c7');
            bgGrad.addColorStop(1, '#0369a1');
        }

        bctx.fillStyle = bgGrad;
        this.roundRect(bctx, 24, 30, 464, 324, 36, true, false);

        bctx.lineWidth = 14;
        bctx.strokeStyle = '#ffffff';
        this.roundRect(bctx, 24, 30, 464, 324, 36, false, true);

        bctx.lineWidth = 4;
        bctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.roundRect(bctx, 36, 42, 440, 300, 26, false, true);

        bctx.textAlign = 'center';
        bctx.textBaseline = 'middle';
        bctx.font = '900 148px "Arial Black", Impact, sans-serif';

        bctx.lineWidth = 22;
        bctx.strokeStyle = isMult ? '#064e3b' : '#082f49';
        bctx.lineJoin = 'round';
        bctx.strokeText(data.label, 256, 175);

        bctx.fillStyle = '#ffffff';
        bctx.fillText(data.label, 256, 175);

        bctx.font = '900 40px "Arial Black", Arial, sans-serif';
        bctx.fillStyle = isMult ? '#a7f3d0' : '#bae6fd';
        bctx.fillText('👥 RUNNERS', 256, 275);

        const boardTexture = new THREE.CanvasTexture(boardCanvas);
        boardTexture.needsUpdate = true;

        const boardMat = new THREE.MeshBasicMaterial({
            map: boardTexture,
            transparent: true,
            side: THREE.DoubleSide
        });

        const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.95), boardMat);
        boardMesh.position.set(0, height * 0.52, -0.05);
        boardMesh.rotation.y = Math.PI;
        group.add(boardMesh);

        this.scene.add(group);

        return {
            group: group,
            x: x,
            z: z,
            width: width,
            data: data,
            isPassed: false,
            onPass: () => {
                energyMat.opacity = 0.95;
                setTimeout(() => { group.visible = false; }, 180);
            }
        };
    }

    createStoneCylinderTower(config) {
        const group = new THREE.Group();
        group.position.set(config.x, 0, config.z);

        const radius = config.radius;
        const height = config.height;
        const rows = 6;
        const cols = 14;
        const blocks = [];

        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.85, metalness: 0.1 });
        const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x47494d, roughness: 0.9, metalness: 0.1 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xf5b722, roughness: 0.3, metalness: 0.7, emissive: 0x553300 });

        const rimGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 1.02, 0.45, 24);
        const rimMesh = new THREE.Mesh(rimGeo, goldMat);
        rimMesh.position.y = height + 0.22;
        rimMesh.castShadow = true;
        group.add(rimMesh);

        const topCore = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 0.2, 16),
            new THREE.MeshStandardMaterial({ color: 0x7c3826, roughness: 0.8 })
        );
        topCore.position.y = height + 0.35;
        group.add(topCore);

        const blockHeight = height / rows;
        for (let r = 0; r < rows; r++) {
            const y = r * blockHeight + blockHeight / 2;
            const angleStep = (Math.PI * 2) / cols;
            const offset = (r % 2) * (angleStep / 2);

            for (let c = 0; c < cols; c++) {
                const angle = c * angleStep + offset;
                const bx = Math.cos(angle) * (radius - 0.25);
                const bz = Math.sin(angle) * (radius - 0.25);

                const blockGeo = new THREE.BoxGeometry(0.75, blockHeight * 0.92, 0.55);
                const mat = ((r + c) % 2 === 0) ? stoneMat : stoneDarkMat;
                const blockMesh = new THREE.Mesh(blockGeo, mat);

                blockMesh.position.set(bx, y, bz);
                blockMesh.rotation.y = -angle + Math.PI / 2;
                blockMesh.castShadow = true;
                blockMesh.receiveShadow = true;

                group.add(blockMesh);
                blocks.push(blockMesh);
            }
        }

        this.scene.add(group);

        return {
            type: 'pillar',
            id: config.id,
            group: group,
            blocks: blocks,
            rimMesh: rimMesh,
            x: config.x,
            z: config.z,
            radius: radius + 0.6,
            hp: config.maxHp,
            maxHp: config.maxHp,
            isDestroyed: false,
            onHit: (damage) => {
                const countToDislodge = Math.min(3, blocks.length);
                for (let k = 0; k < countToDislodge; k++) {
                    if (blocks.length > 0) {
                        const idx = Math.floor(Math.random() * blocks.length);
                        const b = blocks.splice(idx, 1)[0];
                        this.spawnDebrisBlock(b, group.position);
                        group.remove(b);
                    }
                }
            },
            onDestroy: () => {
                blocks.forEach(b => {
                    this.spawnDebrisBlock(b, group.position);
                    group.remove(b);
                });
                if (rimMesh) {
                    this.spawnDebrisBlock(rimMesh, group.position, { vy: 9, vrot: 12 });
                    group.remove(rimMesh);
                }
                group.visible = false;
            }
        };
    }

    createFinishStage(z) {
        const group = new THREE.Group();
        group.position.set(-1.2, 0, z);

        const goldMat = new THREE.MeshStandardMaterial({ color: 0xf5b722, metalness: 0.8, roughness: 0.2 });

        const archTop = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.6, 0.6), goldMat);
        archTop.position.set(0, 5.0, 0);
        group.add(archTop);

        const colLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 5.0, 16), goldMat);
        colLeft.position.set(-4.2, 2.5, 0);
        group.add(colLeft);

        const colRight = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 5.0, 16), goldMat);
        colRight.position.set(4.2, 2.5, 0);
        group.add(colRight);

        const finishCanvas = document.createElement('canvas');
        finishCanvas.width = 128;
        finishCanvas.height = 32;
        const fctx = finishCanvas.getContext('2d');
        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 8; c++) {
                fctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
                fctx.fillRect(c * 16, r * 16, 16, 16);
            }
        }
        const finishTex = new THREE.CanvasTexture(finishCanvas);
        finishTex.wrapS = THREE.RepeatWrapping;
        finishTex.repeat.set(4, 1);

        const finishGround = new THREE.Mesh(
            new THREE.PlaneGeometry(8.0, 2.0),
            new THREE.MeshBasicMaterial({ map: finishTex })
        );
        finishGround.rotation.x = -Math.PI / 2;
        finishGround.position.set(0, 0.03, 0);
        group.add(finishGround);

        const sprite = this.createTextSprite('★ FINISH ★', {
            fontSize: 52,
            textColor: '#ffe600',
            strokeColor: '#b45309',
            strokeWidth: 8
        });
        sprite.position.set(0, 5.2, 0);
        sprite.scale.set(3.5, 1.0, 1);
        group.add(sprite);

        this.scene.add(group);
    }

    // -----------------------------------------------------------------
    // 3D MODEL LOADING & SQUAD SPAWNING (Skin_BF14.glb - No weapons)
    // -----------------------------------------------------------------
    loadPlayerModel() {
        const loader = new GLTFLoader();

        const setupModel = (gltf) => {
            this.basePlayerModel = gltf.scene;
            this.basePlayerModel.scale.set(1.15, 1.15, 1.15);

            this.basePlayerModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    if (node.material) {
                        node.material.roughness = 0.45;
                        node.material.metalness = 0.1;
                    }
                }
            });

            this.modelLoaded = true;
            this.addMemberToSquad(0, 0);
            this.onSquadCountChange(this.squad.length);
            console.log('Skin_BF14.glb model loaded successfully!');
        };

        // Try fetch array buffer for robust loading across all environments
        fetch(skinModelUrl)
            .then(res => res.arrayBuffer())
            .then(buffer => {
                loader.parse(buffer, '', (gltf) => {
                    setupModel(gltf);
                }, (err) => {
                    console.warn('GLTFLoader parse error, trying load:', err);
                    loader.load(skinModelUrl, setupModel, undefined, () => this.fallbackHero());
                });
            })
            .catch(() => {
                loader.load(skinModelUrl, setupModel, undefined, () => this.fallbackHero());
            });
    }

    fallbackHero() {
        this.createProceduralHeroBase();
        this.modelLoaded = true;
        this.addMemberToSquad(0, 0);
        this.onSquadCountChange(this.squad.length);
    }

    createProceduralHeroBase() {
        this.basePlayerModel = new THREE.Group();
        const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
        const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), orangeMat);
        head.position.y = 1.7;
        this.basePlayerModel.add(head);

        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), yellowMat);
        helmet.position.y = 1.75;
        this.basePlayerModel.add(helmet);

        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.9, 12), yellowMat);
        torso.position.y = 1.05;
        this.basePlayerModel.add(torso);

        const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6), darkMat);
        legL.position.set(-0.18, 0.3, 0);
        this.basePlayerModel.add(legL);

        const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6), darkMat);
        legR.position.set(0.18, 0.3, 0);
        this.basePlayerModel.add(legR);
    }

    addMemberToSquad(offsetX = 0, offsetZ = 0) {
        if (!this.basePlayerModel) return;

        let memberModel;
        try {
            memberModel = SkeletonUtils.clone(this.basePlayerModel);
        } catch (e) {
            memberModel = this.basePlayerModel.clone(true);
        }

        memberModel.position.set(this.playerX + offsetX, 0, this.playerZ + offsetZ);
        this.scene.add(memberModel);

        const bones = {};
        memberModel.traverse((node) => {
            if (node.isBone || node.name) {
                bones[node.name] = node;
            }
        });

        this.squad.push({
            model: memberModel,
            bones: bones,
            targetOffsetX: offsetX,
            targetOffsetZ: offsetZ,
            animOffset: Math.random() * 2.0,
            punchPhase: Math.random() * Math.PI
        });
    }

    applyGateMultiplier(gateData) {
        const currentCount = this.squad.length;
        let newCount = currentCount;

        if (gateData.type === 'add') {
            newCount = currentCount + gateData.val;
        } else if (gateData.type === 'mult') {
            newCount = currentCount * gateData.val;
        }

        newCount = Math.min(newCount, 40);
        const toAdd = Math.max(0, newCount - currentCount);

        for (let i = 0; i < toAdd; i++) {
            this.addMemberToSquad();
        }

        this.recalculateSquadFormation();
        this.onSquadCountChange(this.squad.length);

        for (let p = 0; p < 15; p++) {
            this.spawnSparkParticle(this.playerX, 1.5, this.playerZ, 0x38bdf8);
        }
    }

    recalculateSquadFormation() {
        const spacing = 0.75;

        this.squad.forEach((member, i) => {
            if (i === 0) {
                member.targetOffsetX = 0;
                member.targetOffsetZ = 0;
                return;
            }

            const phi = i * 2.399963;
            const r = Math.sqrt(i) * spacing * 0.7;
            member.targetOffsetX = Math.cos(phi) * r;
            member.targetOffsetZ = -Math.abs(Math.sin(phi) * r) * 1.2 - 0.2;
        });
    }

    setupEventListeners() {
        let isDragging = false;
        let startPointerX = 0;
        let startPlayerX = 0;

        const onPointerDown = (e) => {
            isDragging = true;
            startPointerX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            startPlayerX = this.playerX;
            if (!this.isGameActive && !this.isLevelFinished) {
                this.isGameActive = true;
            }
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            // Drag direction: moving mouse left moves player left, moving mouse right moves player right
            const deltaX = (clientX - startPointerX) / (this.width * 0.38);
            this.targetPlayerX = THREE.MathUtils.clamp(startPlayerX - deltaX * 3.6, this.minPlayerX, this.maxPlayerX);
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

    // -----------------------------------------------------------------
    // MAIN LOOP
    // -----------------------------------------------------------------
    update() {
        const delta = Math.min(this.clock.getDelta(), 0.1);
        this.animTime += delta;

        this.floatingBalls.forEach(ball => {
            const u = ball.userData;
            ball.position.y = u.baseY + Math.sin(this.animTime * 2.0 + u.seed) * 0.35;
            ball.rotation.x += u.rotSpeedX;
            ball.rotation.y += u.rotSpeedY;
        });

        if (this.isGameActive && !this.isLevelFinished) {
            this.playerZ += this.playerSpeed * delta;

            this.playerX += (this.targetPlayerX - this.playerX) * 12 * delta;
            this.playerX = THREE.MathUtils.clamp(this.playerX, this.minPlayerX, this.maxPlayerX);

            const progress = THREE.MathUtils.clamp(this.playerZ / this.totalTrackLength, 0, 1);
            this.onProgress(progress);

            this.checkGateCollisions();
            this.checkObstacleCombat(delta);

            if (this.playerZ >= this.totalTrackLength) {
                this.isLevelFinished = true;
                this.isGameActive = false;
                this.onLevelComplete();
            }
        }

        this.updateSquadMembers(delta);
        this.updateDebrisAndParticles(delta);
        this.updateCamera(delta);

        this.renderer.render(this.scene, this.camera);
    }

    checkGateCollisions() {
        this.gates.forEach(g => {
            if (g.isPassed) return;
            const dz = g.z - this.playerZ;

            if (dz < 1.0 && dz > -1.2) {
                const dx = this.playerX - g.x;
                if (Math.abs(dx) < g.width / 2) {
                    g.isPassed = true;
                    g.onPass();
                    this.applyGateMultiplier(g.data);
                }
            }
        });
    }

    checkObstacleCombat(delta) {
        this.isAttacking = false;
        this.hitCooldown -= delta;

        this.obstacles.forEach(obs => {
            if (obs.isDestroyed) return;

            const dz = obs.z - this.playerZ;
            const dx = obs.x - this.playerX;

            if (dz > 0 && dz < 4.6 && Math.abs(dx) < obs.radius + 1.2) {
                this.isAttacking = true;

                if (this.hitCooldown <= 0) {
                    this.hitCooldown = 0.12;

                    const squadPower = 6.3 + (this.squad.length - 1) * 2.5;
                    obs.hp -= squadPower;
                    obs.onHit(squadPower);

                    this.spawnFloatingDamageText(
                        obs.x + (Math.random() - 0.5) * 1.0,
                        2.6 + Math.random() * 0.6,
                        obs.z - 0.5,
                        '6,3'
                    );

                    this.spawnSparkBurst(obs.x, 2.0, obs.z - obs.radius * 0.8);
                    this.onHit({ damage: '6,3' });

                    if (obs.hp <= 0) {
                        obs.isDestroyed = true;
                        obs.onDestroy();
                        this.onCoinCollect({ amount: 500 });
                    }
                }
            }
        });
    }

    updateSquadMembers(delta) {
        const isRunning = this.isGameActive && !this.isLevelFinished;
        const isPunching = this.isAttacking;

        const turnTilt = (this.targetPlayerX - this.playerX) * 0.12;

        this.squad.forEach((member, i) => {
            const targetX = this.playerX + member.targetOffsetX;
            const targetZ = this.playerZ + member.targetOffsetZ;

            member.model.position.x += (targetX - member.model.position.x) * 12 * delta;
            member.model.position.z += (targetZ - member.model.position.z) * 14 * delta;

            member.model.rotation.z = -turnTilt;
            member.model.rotation.y = turnTilt * 0.6;

            const b = member.bones;
            if (b) {
                const runFreq = 14;
                const legSwing = Math.sin((this.animTime + member.animOffset) * runFreq);

                if (isRunning) {
                    if (b['thigh.L']) b['thigh.L'].rotation.x = legSwing * 0.75;
                    if (b['thigh.R']) b['thigh.R'].rotation.x = -legSwing * 0.75;
                    if (b['shin.L']) b['shin.L'].rotation.x = Math.max(0, -legSwing) * 0.85;
                    if (b['shin.R']) b['shin.R'].rotation.x = Math.max(0, legSwing) * 0.85;

                    if (b['spine']) {
                        b['spine'].position.y = -0.04 + Math.abs(legSwing) * 0.08;
                    }

                    if (isPunching) {
                        const punchSwing = Math.sin((this.animTime + member.punchPhase) * 22);
                        if (b['upper_arm.L']) b['upper_arm.L'].rotation.x = -0.5 + punchSwing * 0.8;
                        if (b['upper_arm.R']) b['upper_arm.R'].rotation.x = -0.5 - punchSwing * 0.8;
                    } else {
                        if (b['upper_arm.L']) b['upper_arm.L'].rotation.x = -legSwing * 0.7;
                        if (b['upper_arm.R']) b['upper_arm.R'].rotation.x = legSwing * 0.7;
                        if (b['forearm.L']) b['forearm.L'].rotation.x = 0.3;
                        if (b['forearm.R']) b['forearm.R'].rotation.x = 0.3;
                    }
                } else {
                    const breath = Math.sin(this.animTime * 3.0) * 0.04;
                    if (b['upper_arm.L']) {
                        b['upper_arm.L'].rotation.x = 0.25 + breath;
                        b['upper_arm.L'].rotation.z = -0.22;
                    }
                    if (b['upper_arm.R']) {
                        b['upper_arm.R'].rotation.x = 0.25 + breath;
                        b['upper_arm.R'].rotation.z = 0.22;
                    }
                    if (b['forearm.L']) b['forearm.L'].rotation.x = 0.45;
                    if (b['forearm.R']) b['forearm.R'].rotation.x = 0.45;
                    if (b['thigh.L']) b['thigh.L'].rotation.x = 0;
                    if (b['thigh.R']) b['thigh.R'].rotation.x = 0;
                    if (b['shin.L']) b['shin.L'].rotation.x = 0.04;
                    if (b['shin.R']) b['shin.R'].rotation.x = 0.04;
                    if (b['spine']) b['spine'].position.y = -0.04 + breath * 0.5;
                }
            }
        });
    }

    spawnDebrisBlock(mesh, originPos, options = {}) {
        const debris = mesh.clone();
        debris.position.copy(originPos).add(mesh.position);
        debris.rotation.copy(mesh.rotation);

        const vx = options.vx !== undefined ? options.vx : (Math.random() - 0.5) * 7;
        const vy = options.vy !== undefined ? options.vy : (4 + Math.random() * 6);
        const vz = options.vz !== undefined ? options.vz : (3 + Math.random() * 5);
        const rotV = options.vrot !== undefined ? options.vrot : (Math.random() * 8 + 4);

        this.scene.add(debris);
        this.debrisList.push({
            mesh: debris,
            vx: vx,
            vy: vy,
            vz: vz,
            rotV: rotV,
            life: 1.8
        });
    }

    spawnSparkBurst(x, y, z) {
        for (let i = 0; i < 8; i++) {
            this.spawnSparkParticle(x, y, z, 0xfacc15);
        }
    }

    spawnSparkParticle(x, y, z, color = 0xfacc15) {
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
            life: 0.6,
            maxLife: 0.6
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
            vy: 3.2,
            life: 0.85,
            maxLife: 0.85
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

    updateCamera(delta) {
        if (this.isLevelFinished) {
            const victoryCamPos = new THREE.Vector3(this.playerX + 2.8, 3.5, this.playerZ + 6.5);
            this.camera.position.lerp(victoryCamPos, 3.0 * delta);
            this.camera.lookAt(this.playerX, 1.6, this.playerZ);

            this.squad.forEach(m => {
                m.model.rotation.y = Math.PI * 0.85;
            });
            return;
        }

        // Fixed camera X angle and position (locks camera perspective down center of runway)
        const fixedCamX = -0.8;
        const fixedCamY = 6.0;
        const targetCamZ = this.playerZ - 9.5;

        this.camera.position.x = fixedCamX;
        this.camera.position.y = fixedCamY;
        this.camera.position.z = targetCamZ;

        // Camera looks straight ahead down the track, unaffected by player left-right steering
        const lookTarget = new THREE.Vector3(
            fixedCamX,
            1.6,
            this.playerZ + 10.0
        );
        this.camera.lookAt(lookTarget);

        this.dirLight.position.set(-16, 32, this.playerZ - 15);
        this.dirLight.target.position.set(fixedCamX, 0, this.playerZ + 10);
    }

    createTextSprite(text, options = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        this.renderTextOnCanvas(ctx, canvas.width, canvas.height, text, options);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
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

    roundRect(ctx, x, y, width, height, radius = 5, fill = true, stroke = true) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }
}
