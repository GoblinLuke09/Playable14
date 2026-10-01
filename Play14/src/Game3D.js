import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import skinModelUrl from './assets/Model/Skin_BF14.glb';
import bossModelUrl from './assets/Model/Athlete_05.glb';

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
        this.minPlayerX = -2.7; // Right boundary inside railings
        this.maxPlayerX = 3.5;  // Left boundary inside railings
        this.playerZ = 4.5;     // Positioned closer forward in camera view

        // Track movement
        this.distanceTravelled = 0;
        this.worldSpeed = 5.2; // Slower enemy movement
        this.totalTrackLength = 180;

        // Left lane gate blocking mechanic
        this.isBox23Destroyed = false; // Box 3 stays stationary blocking left gates
        this.leftGatesDistance = 0;    // Left gates only start moving when Box 3 is destroyed!
        this.leftGatesSpeed = 13.5;    // High speed for fast booster gate rush!

        // Shooting stats
        this.fireTimer = 0;
        this.fireInterval = 0.28; // Slower initial fire rate before getting the gun
        this.bulletPower = 1;
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
        this.scene.background = new THREE.Color(0x7da87d);
        this.scene.fog = new THREE.FogExp2(0x567c5e, 0.009);

        // Perspective camera pulled further back behind player looking down the entire bridge track
        this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 400);
        this.camera.position.set(0.4, 8.2, -10.5);
        this.camera.lookAt(0.4, 1.3, 15.0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;

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

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xdff0d8, 0x3d5c38, 0.55);
        this.scene.add(hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.4);
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
    // ENVIRONMENT: Mountain Valleys & Forest Slopes (STATIC)
    // -----------------------------------------------------------------
    createMountainEnvironment() {
        const valleyGeo = new THREE.PlaneGeometry(350, 600, 32, 48);
        const valleyMat = new THREE.MeshLambertMaterial({ color: 0x2e5234, roughness: 0.95 });
        
        const pos = valleyGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vz = pos.getY(i);
            const distFromCenter = Math.abs(vx);
            const elevation = Math.pow(distFromCenter / 25, 1.9) * 4.5 + Math.sin(vz * 0.08) * 8.0 - 18;
            pos.setZ(i, elevation);
        }
        valleyGeo.computeVertexNormals();

        const valleyMesh = new THREE.Mesh(valleyGeo, valleyMat);
        valleyMesh.rotation.x = -Math.PI / 2;
        valleyMesh.position.set(0, -6.5, 120);
        valleyMesh.receiveShadow = true;
        this.scene.add(valleyMesh); // STATIC in scene

        // Procedural pine trees (STATIC in scene)
        const treeTrunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 2.5, 6);
        const treeFoliageGeo = new THREE.ConeGeometry(2.4, 6.0, 7);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3220 });
        const foliageMat1 = new THREE.MeshLambertMaterial({ color: 0x1e4620 });
        const foliageMat2 = new THREE.MeshLambertMaterial({ color: 0x2d5e30 });

        for (let i = 0; i < 90; i++) {
            const side = (i % 2 === 0) ? 1 : -1;
            const tx = side * (12 + Math.random() * 65);
            const tz = -20 + Math.random() * 260;
            const ty = Math.pow(Math.abs(tx) / 25, 1.9) * 4.5 - 18;

            const treeGroup = new THREE.Group();
            treeGroup.position.set(tx, ty, tz);

            const trunk = new THREE.Mesh(treeTrunkGeo, trunkMat);
            trunk.position.y = 1.25;
            treeGroup.add(trunk);

            const foliageMat = (i % 3 === 0) ? foliageMat1 : foliageMat2;
            const foliage = new THREE.Mesh(treeFoliageGeo, foliageMat);
            foliage.position.y = 4.6;
            treeGroup.add(foliage);

            const scale = 0.8 + Math.random() * 0.9;
            treeGroup.scale.set(scale, scale, scale);
            this.scene.add(treeGroup); // STATIC in scene
        }
    }

    // -----------------------------------------------------------------
    // BRIDGE TRACKS (In World Container)
    // -----------------------------------------------------------------
    createBridgeTracks() {
        const trackLength = this.totalTrackLength + 80;
        this.trackGroup = new THREE.Group();

        const concreteRoadMat = new THREE.MeshStandardMaterial({
            color: 0xb5bcc4,
            roughness: 0.8,
            metalness: 0.05
        });
        const bridgeUndersideMat = new THREE.MeshStandardMaterial({
            color: 0x5a6068,
            roughness: 0.9
        });
        const dashedLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // 1. Single Unified Bridge Road Deck (wider road deck from x = -3.0 to x = 3.8)
        const roadWidth = 6.8;
        const roadCenter = 0.4;
        const mainRoadGeo = new THREE.BoxGeometry(roadWidth, 0.6, trackLength);
        const mainRoad = new THREE.Mesh(mainRoadGeo, concreteRoadMat);
        mainRoad.position.set(roadCenter, -0.3, trackLength / 2 - 20);
        mainRoad.receiveShadow = true;
        this.trackGroup.add(mainRoad);

        // Dashed lane divider lines
        const dashLength = 3.0;
        const dashGap = 3.0;
        const dashGeo = new THREE.PlaneGeometry(0.12, dashLength);
        for (let z = -10; z < trackLength; z += (dashLength + dashGap)) {
            // Center divider between Left and Right lane
            const dashCenter = new THREE.Mesh(dashGeo, dashedLineMat);
            dashCenter.rotation.x = -Math.PI / 2;
            dashCenter.position.set(0.70, 0.01, z);
            this.trackGroup.add(dashCenter);

            // Right lane guide dash
            const dashRight = new THREE.Mesh(dashGeo, dashedLineMat);
            dashRight.rotation.x = -Math.PI / 2;
            dashRight.position.set(-1.15, 0.01, z);
            this.trackGroup.add(dashRight);
        }

        // Underside pillars
        const pillarGeo = new THREE.CylinderGeometry(0.8, 1.0, 24, 12);
        for (let z = -10; z < trackLength; z += 30) {
            [-1.2, 2.0].forEach(px => {
                const pillar = new THREE.Mesh(pillarGeo, bridgeUndersideMat);
                pillar.position.set(px, -12.3, z);
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                this.trackGroup.add(pillar);
            });
        }

        this.createBridgeRailings(trackLength);
        this.scene.add(this.trackGroup); // Bridge stays 100% static in scene
    }

    createBridgeRailings(trackLength) {
        const postGeo = new THREE.BoxGeometry(0.16, 1.15, 0.16);
        // Reddish-brown bridge railing material matching the image
        const railMat = new THREE.MeshStandardMaterial({ color: 0x823838, roughness: 0.65 });
        const barMat = new THREE.MeshStandardMaterial({ color: 0x6e2c2c, roughness: 0.6 });

        // Outer Railings
        this.buildRailingRun(-2.95, -20, trackLength, railMat, barMat, postGeo);
        this.buildRailingRun(3.75, -20, trackLength, railMat, barMat, postGeo);

        // Center Divider Railing separating Left Lane (+1 gates) and Right Lane (Enemies)
        this.buildRailingRun(0.65, 16.0, trackLength, railMat, barMat, postGeo);
    }

    buildRailingRun(rx, startZ, endZ, railMat, barMat, postGeo) {
        const len = endZ - startZ;
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, len), railMat);
        topRail.position.set(rx, 0.95, startZ + len / 2);
        this.trackGroup.add(topRail);

        const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, len), railMat);
        midRail.position.set(rx, 0.45, startZ + len / 2);
        this.trackGroup.add(midRail);

        const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, len), railMat);
        bottomRail.position.set(rx, 0.12, startZ + len / 2);
        this.trackGroup.add(bottomRail);

        for (let z = startZ; z <= endZ; z += 3.2) {
            const post = new THREE.Mesh(postGeo, railMat);
            post.position.set(rx, 0.58, z);
            post.castShadow = true;
            this.trackGroup.add(post);

            for (let subZ = z + 0.5; subZ < z + 3.0 && subZ < endZ; subZ += 0.5) {
                const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6), barMat);
                bal.position.set(rx, 0.55, subZ);
                this.trackGroup.add(bal);
            }
        }
    }

    // -----------------------------------------------------------------
    // COURSE LAYOUT
    // -----------------------------------------------------------------
    createCourseLayout() {
        // 1. VISUAL LEFT LANE: Box 3 with Gun (AK-47) is right at the head of the dividing railing (z = 16.0)
        const box3 = this.createNumberCrateStack({
            x: 2.20,
            z: 16.0,
            width: 2.9,
            height: 1.0,
            depth: 1.4,
            hp: 3,
            label: '3',
            hasWeapon: true, // Gun floating on top of box 3!
            isStationary: true // Stays in place blocking left gates until destroyed!
        });
        this.boxObstacles.push(box3);

        // Densely packed continuous row of +1 gates along left lane starting right behind Box 3
        for (let z = 18.2; z <= 260; z += 1.8) {
            const gate = this.createLeftBoosterGate(2.20, z, '+1');
            this.leftGates.push(gate);
        }

        // 2. VISUAL RIGHT LANE: Colossal Swarm of Red Minions spread across entire lane width
        // 350 red minions spread evenly from right railing to center dividing railing
        const minionCount = 350;
        for (let i = 0; i < minionCount; i++) {
            const progress = i / minionCount;
            // Dense Z progression in front of the boss
            const z = 34 + progress * 88 + (Math.random() - 0.5) * 3.5;
            // Spread across the full width of the right lane (from -2.72 to 0.42)
            const x = -2.72 + Math.random() * 3.14;
            this.spawnRedMinion(x, z, { hp: 2 });
        }

        // Giant Red Boss standing at original position (z = 126) behind the red army
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

        // Floating Gun on top of Box 3 (AK-47)
        let weaponModel = null;
        if (config.hasWeapon) {
            weaponModel = this.createAK47Model();
            weaponModel.position.set(0, height + 0.55, 0);
            weaponModel.scale.set(1.15, 1.15, 1.15);
            weaponModel.rotation.set(0.15, Math.PI / 2, 0); // Side profile with slight tilt for camera
            group.add(weaponModel);
            this.floatingWeapons.push({
                model: weaponModel,
                baseY: height + 0.55,
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
        this.onPowerUp({ type: 'gun', power: this.bulletPower });

        for (let i = 0; i < 25; i++) {
            this.spawnSparkParticle(this.playerX, 1.2, this.playerZ, 0xfacc15);
        }
    }

    createLeftBoosterGate(x, z, label) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const width = 2.8;
        const height = 2.6;

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
        const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.05), gMat);
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

        if (this.basePlayerModel) {
            this.setupRedMinionMesh(minionObj);
        } else {
            this.setupProceduralRedMinionMesh(minionObj);
        }

        this.rightLaneGroup.add(group);
        this.redMinions.push(minionObj);
    }

    setupRedMinionMesh(minionObj) {
        if (!this.basePlayerModel) return;
        try {
            if (minionObj.proceduralGroup) {
                minionObj.group.remove(minionObj.proceduralGroup);
                minionObj.proceduralGroup = null;
            }
            if (minionObj.model) {
                minionObj.group.remove(minionObj.model);
            }

            const m = SkeletonUtils.clone(this.basePlayerModel);
            const s = minionObj.scale || 0.65;
            m.scale.set(s, s, s);
            m.rotation.y = 0; // Group handles facing direction (Math.PI)

            // Bright red minion material matching the image
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

            if (this.clips && this.clips.run) {
                const mixer = new THREE.AnimationMixer(m);
                const action = mixer.clipAction(this.clips.run);
                action.timeScale = 0.85 + Math.random() * 0.35; // Asynchronous leg movements
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

        const bossHp = config.hp || 3800;
        this.finalBoss = {
            group: group,
            model: null,
            mixer: null,
            localX: -1.1,
            localZ: z,
            hp: bossHp,
            maxHp: bossHp,
            isDestroyed: false,
            hpTextSprite: null,
            hpBarMesh: null
        };

        // 1. Floating Boss HP Text badge
        const hpSprite = this.createTextSprite(`BOSS: ${bossHp}`, {
            fontSize: 64,
            textColor: '#facc15',
            strokeColor: '#991b1b',
            strokeWidth: 16
        });
        hpSprite.position.set(0, 5.8, 0);
        hpSprite.scale.set(3.4, 1.2, 1);
        group.add(hpSprite);
        this.finalBoss.hpTextSprite = hpSprite;

        // 2. Health Bar Background & Fill
        const barW = 3.6;
        const barH = 0.35;
        const barBg = new THREE.Mesh(new THREE.PlaneGeometry(barW, barH), new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide }));
        barBg.position.set(0, 5.0, 0.01);
        group.add(barBg);

        const barFill = new THREE.Mesh(new THREE.PlaneGeometry(barW, barH), new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
        barFill.position.set(0, 5.0, 0.02);
        group.add(barFill);
        this.finalBoss.hpBarMesh = barFill;

        // 3. Glowing Boss ground ring
        const ringGeo = new THREE.RingGeometry(1.4, 1.9, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
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
            m.scale.set(3.0, 3.0, 3.0);
            m.rotation.y = Math.PI; // Face towards player squad

            // Red Boss material matching the giant boss in the image
            const bossRedMat = new THREE.MeshStandardMaterial({
                color: 0x991b1b,
                roughness: 0.35,
                metalness: 0.25
            });

            m.traverse(node => {
                if (node.isMesh || node.isSkinnedMesh) {
                    node.material = bossRedMat;
                    node.frustumCulled = false;
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            const mixer = new THREE.AnimationMixer(m);
            if (this.bossAnimations && this.bossAnimations.length > 0) {
                const action = mixer.clipAction(this.bossAnimations[0]);
                action.play();
            } else if (this.clips && this.clips.run) {
                const action = mixer.clipAction(this.clips.run);
                action.play();
            }
            this.finalBoss.mixer = mixer;

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
        loader.load(bossModelUrl, (gltf) => {
            this.baseBossModel = gltf.scene;
            this.bossAnimations = gltf.animations || [];
            this.setupBossMesh();
        }, undefined, (err) => {
            console.warn('Fallback loading boss model', err);
            this.setupProceduralBossMesh();
        });
    }

    // -----------------------------------------------------------------
    // 3D MODEL LOADING: Skin_BF14 & Hero_02
    // -----------------------------------------------------------------
    setupInitialPlayer() {
        // Create initial player runner on frame 1 so player is immediately visible with a gun
        this.fallbackHero();
    }

    loadPlayerModel() {
        const loader = new GLTFLoader();

        const setupModel = (gltf) => {
            this.basePlayerModel = gltf.scene;
            this.basePlayerModel.scale.set(0.50, 0.50, 0.50); // Scaled down to ~70% size

            this.basePlayerModel.traverse((node) => {
                if (node.isSkinnedMesh || node.isMesh) {
                    node.frustumCulled = false;
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            this.modelLoaded = true;

            // Upgrade squad with Skin_BF14 model
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

            // Apply Skin_BF14 (in bright red) to all Red Minions
            this.redMinions.forEach(m => {
                this.setupRedMinionMesh(m);
            });
        };

        fetch(skinModelUrl)
            .then(res => res.arrayBuffer())
            .then(buffer => {
                loader.parse(buffer, '', (gltf) => {
                    setupModel(gltf);
                }, () => {
                    loader.load(skinModelUrl, setupModel, undefined, () => this.fallbackHero());
                });
            })
            .catch(() => {
                loader.load(skinModelUrl, setupModel, undefined, () => this.fallbackHero());
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

        const gun = this.createAK47Model();
        gun.scale.set(0.34, 0.34, 0.34); // Proportionate to 70% runner scale
        gun.position.set(0.30, 0.76, 0.50);
        gun.rotation.set(-0.06, 0, 0);
        memberModel.add(gun);

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
            gun: gun,
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

    // -----------------------------------------------------------------
    // BULLETS & SHOOTING
    // -----------------------------------------------------------------
    spawnBullet(originX, originZ) {
        const bulletGeo = new THREE.ConeGeometry(0.075, 0.48, 8);
        const bulletMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const bulletMesh = new THREE.Mesh(bulletGeo, bulletMat);
        bulletMesh.rotation.x = Math.PI / 2;
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
                            minion.baseLocalX = -2.72 + Math.random() * 3.14;
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

                    if (boss.hpTextSprite && boss.hpTextSprite.userData && boss.hpTextSprite.userData.ctx) {
                        this.renderTextOnCanvas(
                            boss.hpTextSprite.userData.ctx,
                            boss.hpTextSprite.userData.canvas.width,
                            boss.hpTextSprite.userData.canvas.height,
                            `BOSS: ${Math.max(0, Math.ceil(boss.hp))}`,
                            boss.hpTextSprite.userData.options
                        );
                        boss.hpTextSprite.userData.texture.needsUpdate = true;
                    }

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
                m.localX = m.baseLocalX + Math.sin(this.animTime * m.wobbleSpeed + m.wobblePhase) * m.wobbleAmp;
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
                    minion.baseLocalX = -2.72 + Math.random() * 3.14;
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

        const roadMinX = -2.75;
        const roadMaxX = 3.55;

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

    spawnSparkBurst(x, y, z) {
        for (let i = 0; i < 7; i++) {
            this.spawnSparkParticle(x, y, z, 0x38bdf8);
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
}
