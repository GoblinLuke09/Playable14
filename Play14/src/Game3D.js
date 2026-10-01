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

        // Player is stationary at Z = 0; starts on Main Runner lane (x = -1.0, visually right)
        this.playerX = -1.0;
        this.targetPlayerX = -1.0;
        this.minPlayerX = -2.4; // Right lane boundary (visual right)
        this.maxPlayerX = 2.8;  // Left lane boundary (visual left, to shoot Box 23)
        this.playerZ = 0;       // Fixed Z position!
        
        // Right lane movement (moves normally from start)
        this.distanceTravelled = 0;
        this.worldSpeed = 7.5;
        this.totalTrackLength = 205;

        // Left lane gate blocking mechanic
        this.isBox23Destroyed = false; // Box 23 stays stationary blocking left gates
        this.leftGatesDistance = 0;    // Left gates only start moving when Box 23 is destroyed!

        // Shooting stats
        this.fireTimer = 0;
        this.fireInterval = 0.12;
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
        this.enemies = [];
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
        this.loadPlayerModel();
        this.loadBossModel();
        this.setupEventListeners();
        this.renderer.render(this.scene, this.camera);
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x7da87d);
        this.scene.fog = new THREE.FogExp2(0x567c5e, 0.009);

        // Fixed perspective camera behind stationary player looking down the bridge
        this.camera = new THREE.PerspectiveCamera(52, this.width / this.height, 0.1, 400);
        this.camera.position.set(0.6, 7.8, -10.5);
        this.camera.lookAt(0.6, 1.2, 10.0);

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
        const trackLength = this.totalTrackLength + 50;
        this.trackGroup = new THREE.Group();

        const concreteRoadMat = new THREE.MeshStandardMaterial({
            color: 0xadb3ba,
            roughness: 0.85,
            metalness: 0.05
        });
        const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const bridgeUndersideMat = new THREE.MeshStandardMaterial({
            color: 0x6e737a,
            roughness: 0.9
        });

        // 1. Initial Roadway
        const initRoadGeo = new THREE.BoxGeometry(6.6, 0.6, 40);
        const initRoad = new THREE.Mesh(initRoadGeo, concreteRoadMat);
        initRoad.position.set(0.6, -0.3, 0);
        initRoad.receiveShadow = true;
        this.trackGroup.add(initRoad);

        [-2.4, 3.6].forEach(lx => {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 40), edgeLineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(lx, 0.01, 0);
            this.trackGroup.add(line);
        });

        // 2. Split Booster Track (VISUAL LEFT -> x = 2.2, width = 2.4)
        const splitLen = trackLength - 20;
        const boosterRoadGeo = new THREE.BoxGeometry(2.4, 0.6, splitLen);
        const boosterRoad = new THREE.Mesh(boosterRoadGeo, concreteRoadMat);
        boosterRoad.position.set(2.2, -0.3, 20 + splitLen / 2);
        boosterRoad.receiveShadow = true;
        this.trackGroup.add(boosterRoad);

        [1.1, 3.3].forEach(lx => {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, splitLen), edgeLineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(lx, 0.01, 20 + splitLen / 2);
            this.trackGroup.add(line);
        });

        // 3. Split Main Runner Track (VISUAL RIGHT -> x = -1.0, width = 3.4)
        const mainRoadGeo = new THREE.BoxGeometry(3.4, 0.6, splitLen);
        const mainRoad = new THREE.Mesh(mainRoadGeo, concreteRoadMat);
        mainRoad.position.set(-1.0, -0.3, 20 + splitLen / 2);
        mainRoad.receiveShadow = true;
        this.trackGroup.add(mainRoad);

        [-2.6, 0.6].forEach(rx => {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, splitLen), edgeLineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(rx, 0.01, 20 + splitLen / 2);
            this.trackGroup.add(line);
        });

        // Underside pillars
        const pillarGeo = new THREE.CylinderGeometry(0.7, 0.9, 20, 12);
        for (let z = -10; z < trackLength; z += 28) {
            [-1.0, 2.2].forEach(px => {
                const pillar = new THREE.Mesh(pillarGeo, bridgeUndersideMat);
                pillar.position.set(px, -10.3, z);
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                this.trackGroup.add(pillar);
            });
        }

        this.createBridgeRailings(trackLength);
        this.scene.add(this.trackGroup); // Bridge stays 100% static in scene
    }

    createBridgeRailings(trackLength) {
        const postGeo = new THREE.BoxGeometry(0.18, 1.1, 0.18);
        const railMat = new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.7 });
        const barMat = new THREE.MeshStandardMaterial({ color: 0x5c6168, roughness: 0.6 });

        this.buildRailingRun(-2.75, -15, trackLength, railMat, barMat, postGeo);
        this.buildRailingRun(3.65, -15, trackLength, railMat, barMat, postGeo);
        this.buildRailingRun(0.75, 20, trackLength, railMat, barMat, postGeo);
        this.buildRailingRun(1.05, 20, trackLength, railMat, barMat, postGeo);

        // Entrance barrier on Booster split lane (Visual Left -> x = 2.2)
        const barrierGeo = new THREE.BoxGeometry(1.3, 0.9, 0.1);
        const barrierMat = new THREE.MeshStandardMaterial({ color: 0x555a60 });
        this.leftBarrier = new THREE.Mesh(barrierGeo, barrierMat);
        this.leftBarrier.position.set(2.2, 0.45, 21.5);
        this.trackGroup.add(this.leftBarrier);
    }

    buildRailingRun(rx, startZ, endZ, railMat, barMat, postGeo) {
        const len = endZ - startZ;
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, len), railMat);
        topRail.position.set(rx, 0.95, startZ + len / 2);
        this.trackGroup.add(topRail);

        const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, len), railMat);
        midRail.position.set(rx, 0.45, startZ + len / 2);
        this.trackGroup.add(midRail);

        for (let z = startZ; z <= endZ; z += 3.2) {
            const post = new THREE.Mesh(postGeo, railMat);
            post.position.set(rx, 0.55, z);
            post.castShadow = true;
            this.trackGroup.add(post);

            for (let subZ = z + 0.6; subZ < z + 3.0 && subZ < endZ; subZ += 0.6) {
                const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6), barMat);
                bal.position.set(rx, 0.5, subZ);
                this.trackGroup.add(bal);
            }
        }
    }

    // -----------------------------------------------------------------
    // COURSE LAYOUT
    // -----------------------------------------------------------------
    createCourseLayout() {
        // 1. VISUAL LEFT LANE (x = 2.2): Box 23 with AK-47 is STATIONARY at z = 25.5
        const box23 = this.createNumberCrateStack({
            x: 2.2,
            z: 25.5,
            width: 1.8,
            height: 1.8,
            depth: 1.5,
            hp: 23,
            label: '23',
            hasWeapon: true,
            isStationary: true // Stays in place blocking left gates until destroyed!
        });
        this.boxObstacles.push(box23);

        // Long row of +1 gates along left lane (moves ONLY after Box 23 is destroyed)
        for (let z = 31; z <= 155; z += 3.2) {
            const gate = this.createLeftBoosterGate(2.2, z, '+1');
            this.leftGates.push(gate);
        }

        // 2. VISUAL RIGHT LANE (x = -1.0): Gate "+7", Box "89", Blue Monster, Box "192", Gate "+10", Box "785" with Gun
        const gate7 = this.createTranslucentGate(-1.0, 32, { type: 'add', val: 7, label: '+7' });
        this.gates.push(gate7);

        const box89 = this.createNumberCrateStack({
            x: -1.0,
            z: 60,
            width: 1.9,
            height: 1.9,
            depth: 1.5,
            hp: 89,
            label: '89'
        });
        this.boxObstacles.push(box89);

        this.spawnEnemyGuard(-1.0, 74, { hp: 120, maxHp: 120 });

        const box192 = this.createNumberCrateStack({
            x: -1.0,
            z: 94,
            width: 1.9,
            height: 1.9,
            depth: 1.5,
            hp: 192,
            label: '192'
        });
        this.boxObstacles.push(box192);

        // Gate +10 ahead
        const gate10 = this.createTranslucentGate(-1.0, 116, { type: 'add', val: 10, label: '+10' });
        this.gates.push(gate10);

        const box785 = this.createNumberCrateStack({
            x: -1.0,
            z: 138,
            width: 2.0,
            height: 2.0,
            depth: 1.6,
            hp: 785,
            label: '785',
            hasWeapon: true
        });
        this.boxObstacles.push(box785);

        this.createFinalBoss(185, { hp: 1500, maxHp: 1500 });
    }

    createNumberCrateStack(config) {
        const group = new THREE.Group();
        group.position.set(config.x, 0, config.z);

        const width = config.width;
        const height = config.height;
        const depth = config.depth;

        const yellowMat = new THREE.MeshStandardMaterial({ color: 0xebb405, roughness: 0.35, metalness: 0.15 });
        const yellowDarkMat = new THREE.MeshStandardMaterial({ color: 0xc99400, roughness: 0.45, metalness: 0.1 });

        const blockGeo = new THREE.BoxGeometry(width, height * 0.46, depth);
        
        const b1 = new THREE.Mesh(blockGeo, yellowMat);
        b1.position.set(0, height * 0.23, 0);
        b1.castShadow = true;
        b1.receiveShadow = true;
        group.add(b1);

        const b2 = new THREE.Mesh(blockGeo, yellowDarkMat);
        b2.position.set(0, height * 0.72, 0);
        b2.castShadow = true;
        b2.receiveShadow = true;
        group.add(b2);

        const textSprite = this.createTextSprite(config.label, {
            fontSize: 78,
            textColor: '#e11d48',
            strokeColor: '#ffffff',
            strokeWidth: 16
        });
        textSprite.position.set(0, height * 0.52, -depth / 2 - 0.05);
        textSprite.scale.set(width * 0.95, height * 0.55, 1);
        textSprite.rotation.y = Math.PI;
        group.add(textSprite);

        let weaponModel = null;
        if (config.hasWeapon) {
            weaponModel = this.createAK47Model();
            weaponModel.position.set(0, height + 0.55, 0);
            weaponModel.scale.set(1.4, 1.4, 1.4);
            weaponModel.rotation.set(0, Math.PI / 2, 0);
            group.add(weaponModel);
            this.floatingWeapons.push({
                model: weaponModel,
                baseY: height + 0.55,
                parentBox: group
            });
        }

        // Stationary box (Box 23) added to stationaryGroup, moving boxes to rightLaneGroup
        if (config.isStationary) {
            this.stationaryGroup.add(group);
        } else {
            this.rightLaneGroup.add(group);
        }

        const boxObj = {
            group: group,
            b1: b1,
            b2: b2,
            localX: config.x,
            localZ: config.z,
            isStationary: !!config.isStationary,
            width: width,
            height: height,
            depth: depth,
            hp: config.hp,
            maxHp: config.hp,
            label: config.label,
            textSprite: textSprite,
            weaponModel: weaponModel,
            hasWeapon: config.hasWeapon,
            isDestroyed: false,
            onHit: function(dmg) {
                if (textSprite && textSprite.userData && textSprite.userData.ctx) {
                    const currentVal = Math.max(0, Math.ceil(this.hp)).toString();
                    const ctx = textSprite.userData.ctx;
                    const w = textSprite.userData.canvas.width;
                    const h = textSprite.userData.canvas.height;
                    
                    ctx.clearRect(0, 0, w, h);
                    ctx.font = '900 86px "Arial Black", Impact, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    ctx.lineWidth = 18;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineJoin = 'round';
                    ctx.strokeText(currentVal, w / 2, h / 2);

                    ctx.fillStyle = '#e11d48';
                    ctx.fillText(currentVal, w / 2, h / 2);

                    textSprite.userData.texture.needsUpdate = true;
                }

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
                    if (this.leftBarrier) {
                        this.leftBarrier.visible = false;
                    }
                }
                group.visible = false;
            }.bind(this)
        };

        return boxObj;
    }

    spawnDebris(worldPos, isStationary = false) {
        // Explode into 8 yellow debris blocks
        const pieceGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const pieceMat = new THREE.MeshStandardMaterial({ color: 0xebb405, roughness: 0.3 });
        for (let i = 0; i < 8; i++) {
            const piece = new THREE.Mesh(pieceGeo, pieceMat);
            piece.position.copy(worldPos).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2));
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
        const blueGunMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35, metalness: 0.6 });
        const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.85 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6, metalness: 0.1 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.9), blueGunMat);
        body.position.set(0, 0, 0);
        body.castShadow = true;
        gun.add(body);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8), darkMetalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.04, 0.78);
        barrel.castShadow = true;
        gun.add(barrel);

        const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), woodMat);
        gasTube.rotation.x = Math.PI / 2;
        gasTube.position.set(0, 0.09, 0.62);
        gun.add(gasTube);

        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.45), woodMat);
        handguard.position.set(0, 0.02, 0.58);
        gun.add(handguard);

        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.2), darkMetalMat);
        mag.position.set(0, -0.22, 0.22);
        mag.rotation.x = 0.38;
        gun.add(mag);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.12), woodMat);
        grip.position.set(0, -0.16, -0.18);
        grip.rotation.x = -0.42;
        gun.add(grip);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.65), woodMat);
        stock.position.set(0, -0.04, -0.68);
        stock.rotation.x = -0.08;
        gun.add(stock);

        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x60a5fa,
            transparent: true,
            opacity: 0.35,
            side: THREE.BackSide
        });
        const glowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 1.8), glowMat);
        glowMesh.position.set(0, 0, 0.05);
        gun.add(glowMesh);

        return gun;
    }

    triggerWeaponPickup(weaponModel, worldPos) {
        this.bulletPower += 2;
        this.fireInterval = Math.max(0.04, this.fireInterval * 0.7);
        this.onPowerUp({ type: 'gun', power: this.bulletPower });

        for (let i = 0; i < 20; i++) {
            this.spawnSparkParticle(this.playerX, 1.2, this.playerZ, 0x60a5fa);
        }
    }

    createTranslucentGate(x, z, data) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const width = 3.2;
        const height = 3.6;

        const postMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, roughness: 0.2 });
        const pL = new THREE.Mesh(new THREE.BoxGeometry(0.14, height, 0.14), postMat);
        pL.position.set(-width / 2 + 0.07, height / 2, 0);
        group.add(pL);

        const pR = new THREE.Mesh(new THREE.BoxGeometry(0.14, height, 0.14), postMat);
        pR.position.set(width / 2 - 0.07, height / 2, 0);
        group.add(pR);

        const energyMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const energyMesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.2, height * 0.75), energyMat);
        energyMesh.position.set(0, height * 0.45, 0);
        group.add(energyMesh);

        const sprite = this.createTextSprite(data.label, {
            fontSize: 72,
            textColor: '#ffffff',
            strokeColor: '#0284c7',
            strokeWidth: 14
        });
        sprite.position.set(0, height * 0.52, 0);
        sprite.scale.set(2.4, 1.4, 1);
        group.add(sprite);

        this.rightLaneGroup.add(group);

        return {
            group: group,
            localX: x,
            localZ: z,
            width: width,
            data: data,
            isPassed: false,
            onPass: () => {
                energyMat.opacity = 0.95;
                // Add runners to squad based on gate value!
                this.applyGateRunnerIncrease(data);
                this.onPowerUp({ type: 'gate', val: data.val });
                setTimeout(() => { group.visible = false; }, 200);
            }
        };
    }

    applyGateRunnerIncrease(gateData) {
        const countToAdd = gateData.val || 1;
        for (let i = 0; i < countToAdd; i++) {
            if (this.squad.length < 35) {
                this.addMemberToSquad();
            }
        }
        this.recalculateSquadFormation();
        this.onSquadCountChange(this.squad.length);

        for (let p = 0; p < 16; p++) {
            this.spawnSparkParticle(this.playerX, 1.2, this.playerZ, 0x38bdf8);
        }
    }

    createLeftBoosterGate(x, z, label) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const width = 2.1;
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
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const energyMesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.1, height * 0.7), energyMat);
        energyMesh.position.set(0, height * 0.42, 0);
        group.add(energyMesh);

        const sprite = this.createTextSprite(label, {
            fontSize: 54,
            textColor: '#ffffff',
            strokeColor: '#0369a1',
            strokeWidth: 10
        });
        sprite.position.set(0, height * 0.45, 0);
        sprite.scale.set(1.4, 0.85, 1);
        group.add(sprite);

        this.leftGatesGroup.add(group); // Added to leftGatesGroup (moves only when Box 23 is destroyed)

        return {
            group: group,
            localX: x,
            localZ: z,
            width: width,
            isTriggered: false,
            onHitBullet: () => {
                this.bulletPower += 0.2;
                energyMat.opacity = 0.9;
                setTimeout(() => { energyMat.opacity = 0.35; }, 80);
                const currentGateZ = this.isBox23Destroyed ? (z - this.leftGatesDistance) : z;
                this.spawnSparkParticle(x, 1.2, this.playerZ + currentGateZ, 0x38bdf8);
            },
            onPassPlayer: () => {
                // When player passes through +1 gate, add 1 runner!
                if (this.squad.length < 35) {
                    this.addMemberToSquad();
                    this.recalculateSquadFormation();
                    this.onSquadCountChange(this.squad.length);
                }
            }
        };
    }

    spawnEnemyGuard(x, z, config) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const enemyObj = {
            group: group,
            model: null,
            mixer: null,
            localX: x,
            localZ: z,
            hp: config.hp,
            maxHp: config.hp,
            isDestroyed: false,
            hpTextSprite: null
        };

        const hpSprite = this.createTextSprite(`${config.hp}`, {
            fontSize: 72,
            textColor: '#ffffff',
            strokeColor: '#1e3a8a',
            strokeWidth: 14
        });
        hpSprite.position.set(0, 1.8, 0);
        hpSprite.scale.set(1.1, 0.6, 1);
        group.add(hpSprite);
        enemyObj.hpTextSprite = hpSprite;

        if (this.basePlayerModel) {
            this.setupEnemyMesh(enemyObj);
        } else {
            this.setupProceduralEnemyMesh(enemyObj);
        }

        this.rightLaneGroup.add(group);
        this.enemies.push(enemyObj);
    }

    setupEnemyMesh(enemyObj) {
        if (!this.basePlayerModel) return;
        try {
            if (enemyObj.proceduralGroup) {
                enemyObj.group.remove(enemyObj.proceduralGroup);
                enemyObj.proceduralGroup = null;
            }
            if (enemyObj.model) {
                enemyObj.group.remove(enemyObj.model);
            }

            const m = SkeletonUtils.clone(this.basePlayerModel);
            m.scale.set(0.72, 0.72, 0.72);
            m.rotation.y = Math.PI; // Face towards player

            const blueMat = new THREE.MeshStandardMaterial({
                color: 0x1d4ed8,
                roughness: 0.35,
                metalness: 0.25
            });

            m.traverse(node => {
                if (node.isMesh || node.isSkinnedMesh) {
                    node.material = blueMat;
                    node.frustumCulled = false;
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            if (this.clips && this.clips.run) {
                const mixer = new THREE.AnimationMixer(m);
                const action = mixer.clipAction(this.clips.run);
                action.play();
                mixer.setTime(Math.random() * 1.2);
                enemyObj.mixer = mixer;
            }

            enemyObj.group.add(m);
            enemyObj.model = m;
        } catch (e) {
            console.warn('Error setting up enemy mesh', e);
        }
    }

    setupProceduralEnemyMesh(enemyObj) {
        const procGroup = new THREE.Group();
        const blueMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.5 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 0.9, 12), blueMat);
        body.position.y = 0.75;
        body.castShadow = true;
        procGroup.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), blueMat);
        head.position.y = 1.35;
        head.castShadow = true;
        procGroup.add(head);

        const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.35), darkMat);
        shoulders.position.y = 1.05;
        procGroup.add(shoulders);

        enemyObj.group.add(procGroup);
        enemyObj.proceduralGroup = procGroup;
        enemyObj.model = null;
    }

    createFinalBoss(z, config = {}) {
        const group = new THREE.Group();
        group.position.set(-1.0, 0, z);

        const bossHp = config.hp || 1500;
        this.finalBoss = {
            group: group,
            model: null,
            mixer: null,
            localX: -1.0,
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
        const redMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 });

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
    loadPlayerModel() {
        const loader = new GLTFLoader();

        const setupModel = (gltf) => {
            this.basePlayerModel = gltf.scene;
            this.basePlayerModel.scale.set(0.72, 0.72, 0.72);

            this.basePlayerModel.traverse((node) => {
                if (node.isSkinnedMesh || node.isMesh) {
                    node.frustumCulled = false;
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            this.modelLoaded = true;
            this.addMemberToSquad(0, 0);
            this.onSquadCountChange(this.squad.length);
            this.enemies.forEach(e => {
                this.setupEnemyMesh(e);
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
        this.addMemberToSquad(0, 0);
        this.onSquadCountChange(this.squad.length);
        this.enemies.forEach(e => {
            this.setupEnemyMesh(e);
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
        gun.scale.set(0.62, 0.62, 0.12);
        gun.position.set(0.36, 1.16, 0.38);
        gun.rotation.set(-0.04, 0, 0);
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
        const baseSpacing = Math.max(0.52, 0.72 - Math.min(0.20, count * 0.005));

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
            member.targetOffsetZ = -Math.abs(Math.sin(phi) * r) * 1.15 - 0.25;
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
        const bulletGeo = new THREE.ConeGeometry(0.09, 0.6, 8);
        const bulletMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const bulletMesh = new THREE.Mesh(bulletGeo, bulletMat);
        bulletMesh.rotation.x = Math.PI / 2;
        bulletMesh.position.set(originX, 0.84, originZ);

        this.scene.add(bulletMesh);
        this.bullets.push({
            mesh: bulletMesh,
            speed: 68,
            damage: this.bulletPower,
            life: 1.6
        });

        this.onShoot();
    }

    updateBullets(delta) {
        if (this.isGameActive && !this.isLevelFinished) {
            this.fireTimer += delta;
            if (this.fireTimer >= this.fireInterval) {
                this.fireTimer = 0;
                // Fire from all squad runners!
                const squadCount = this.squad.length;
                const maxStreams = Math.min(8, squadCount);
                for (let i = 0; i < maxStreams; i++) {
                    const runner = this.squad[i];
                    this.spawnBullet(runner.model.position.x + 0.19, runner.model.position.z + 0.85);
                }
            }
        }

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.life -= delta;
            b.mesh.position.z += b.speed * delta;

            let bulletRemoved = false;

            // 1. Boxes collision (Stationary Box 23 uses localZ, moving boxes use localZ - distanceTravelled)
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

            // 2. Enemies collision
            for (let k = 0; k < this.enemies.length; k++) {
                const enemy = this.enemies[k];
                if (enemy.isDestroyed) continue;

                const worldEnemyZ = enemy.localZ - this.distanceTravelled;
                const dz = worldEnemyZ - b.mesh.position.z;
                const dx = Math.abs(enemy.localX - b.mesh.position.x);

                if (dz > -0.4 && dz < 1.2 && dx < 1.2) {
                    enemy.hp -= b.damage;
                    if (enemy.hpTextSprite && enemy.hpTextSprite.userData && enemy.hpTextSprite.userData.ctx) {
                        this.renderTextOnCanvas(
                            enemy.hpTextSprite.userData.ctx,
                            enemy.hpTextSprite.userData.canvas.width,
                            enemy.hpTextSprite.userData.canvas.height,
                            `${Math.max(0, Math.ceil(enemy.hp))}`,
                            enemy.hpTextSprite.userData.options
                        );
                        enemy.hpTextSprite.userData.texture.needsUpdate = true;
                    }
                    this.spawnSparkBurst(b.mesh.position.x, 1.4, b.mesh.position.z);
                    this.spawnFloatingDamageText(enemy.localX, 2.4, worldEnemyZ, `-${Math.ceil(b.damage)}`);

                    if (enemy.hp <= 0) {
                        enemy.isDestroyed = true;
                        enemy.group.visible = false;
                        for (let p = 0; p < 25; p++) {
                            this.spawnSparkParticle(enemy.localX, 1.4, worldEnemyZ, 0x1d4ed8);
                        }
                        this.onCoinCollect({ amount: 800 });
                    }

                    this.scene.remove(b.mesh);
                    this.bullets.splice(i, 1);
                    bulletRemoved = true;
                    break;
                }
            }
            if (bulletRemoved) continue;

            // 3. Left lane +1 booster gates (moves only when Box 23 is destroyed)
            for (let k = 0; k < this.leftGates.length; k++) {
                const lg = this.leftGates[k];
                const worldGateZ = this.isBox23Destroyed ? (lg.localZ - this.leftGatesDistance) : lg.localZ;
                const dz = worldGateZ - b.mesh.position.z;
                const dx = Math.abs(lg.localX - b.mesh.position.x);

                if (dz > -0.4 && dz < 0.8 && dx < lg.width / 2) {
                    lg.onHitBullet();
                    b.damage += 0.4;
                }
            }

            // 4. Final Boss collision (Athlete_05)
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

            if (b.life <= 0 || b.mesh.position.z > 60) {
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

            // Left lane +1 gates move ONLY after Box 23 is destroyed!
            if (this.isBox23Destroyed) {
                this.leftGatesDistance += this.worldSpeed * delta;
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

        // Update enemy and boss animation mixers
        this.enemies.forEach(e => {
            if (e.mixer) e.mixer.update(delta);
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
        // Main Gates (+7, +10)
        this.gates.forEach(g => {
            if (g.isPassed) return;
            const worldGateZ = g.localZ - this.distanceTravelled;

            // When gate reaches player (player is at Z = 0)
            if (worldGateZ < 1.0 && worldGateZ > -1.2) {
                const dx = this.playerX - g.localX;
                if (Math.abs(dx) < g.width / 2) {
                    g.isPassed = true;
                    g.onPass();
                }
            }
        });

        // Left +1 booster gates (moves only when Box 23 is destroyed)
        this.leftGates.forEach(lg => {
            if (lg.isTriggered) return;
            const worldGateZ = this.isBox23Destroyed ? (lg.localZ - this.leftGatesDistance) : lg.localZ;

            if (worldGateZ < 1.2 && worldGateZ > -1.2) {
                const dx = this.playerX - lg.localX;
                if (Math.abs(dx) < lg.width / 2 + 0.6) {
                    lg.isTriggered = true;
                    lg.onPassPlayer();
                    lg.group.visible = false;
                }
            }
        });
    }

    checkEnemyCollisions() {
        this.enemies.forEach(enemy => {
            if (enemy.isDestroyed) return;
            const worldEnemyZ = enemy.localZ - this.distanceTravelled;

            // When enemy passes the player line (Z <= 0.6)
            if (worldEnemyZ <= 0.6) {
                enemy.isDestroyed = true;
                enemy.group.visible = false;

                const runnersLost = Math.max(1, Math.ceil(enemy.hp));
                this.removeRunnersFromSquad(runnersLost);
                this.onHit({ type: 'enemy', damage: runnersLost });

                for (let p = 0; p < 25; p++) {
                    this.spawnSparkParticle(enemy.localX, 1.2, 0, 0x1d4ed8);
                }
            }
        });
    }

    checkBoxObstacleCollisions() {
        this.boxObstacles.forEach(box => {
            if (box.isDestroyed || box.isStationary) return;
            const worldBoxZ = box.localZ - this.distanceTravelled;

            // When moving box passes the player line (Z <= 0.6)
            if (worldBoxZ <= 0.6) {
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

        this.squad.forEach((member) => {
            const targetX = this.playerX + member.targetOffsetX;
            const targetZ = this.playerZ + member.targetOffsetZ;

            member.model.position.x += (targetX - member.model.position.x) * 14 * delta;
            member.model.position.z += (targetZ - member.model.position.z) * 14 * delta;

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
