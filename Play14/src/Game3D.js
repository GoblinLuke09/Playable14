import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import athleteModelUrl from './assets/Model/Athlete_05.glb';
import skinModelUrl from './assets/Model/Skin_BF14.glb';

export class Game3D {
    constructor(container, options = {}) {
        this.container = container;
        this.onHit = options.onHit || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onSquadCountChange = options.onSquadCountChange || (() => {});
        this.onLevelComplete = options.onLevelComplete || (() => {});
        this.onGameOver = options.onGameOver || (() => {});
        this.onCoinCollect = options.onCoinCollect || (() => {});
        this.onTierUpgrade = options.onTierUpgrade || (() => {});
        this.onLevelTransition = options.onLevelTransition || (() => {});
        this.onLevelStart = options.onLevelStart || (() => {});

        this.width = container.clientWidth || window.innerWidth;
        this.height = container.clientHeight || window.innerHeight;

        this.isGameActive = true;
        this.isLevelFinished = false;
        this.isPlayerInteracted = false;
        this.currentLevel = 1;
        this.isLevelTransitioning = false;

        // Player Cannon Position & Controls
        this.cannonX = 0;
        this.targetCannonX = 0;
        this.minCannonX = -2.8;
        this.maxCannonX = 2.8;
        this.cannonZ = -2.0;
        this.levelBaselineZ = 0.0;

        // Cannon Level / Tier: 0 (Starter), 1 (Dual), 2 (Triple), 3 (Jet), 4 (Railgun), 5 (Hyper Gunship)
        this.currentCannonTier = 0;
        this.soldiersPerShot = 1;

        // Firing rate - fast steady stream
        this.shootTimer = 0;
        this.shootInterval = 0.16; // ~6.2 shots/sec
        this.recoilAnim = 0;
        this.muzzleFlashTimer = 0;

        // Speeds
        this.alliedSpeed = 4.4;
        this.enemySpeed = -2.2;

        // Massive Swarm Limit
        this.MAX_ALLIED_MOBS = 220;
        this.MAX_ENEMY_MOBS = 60;

        // Models
        this.bluePlayerBaseModel = null;
        this.redPlayerBaseModel = null;
        this.modelLoaded = false;

        // Troops Lists
        this.alliedMobs = [];
        this.enemyMobs = [];

        // Level Entities
        this.gates = [];
        this.yellowBlocks = [];
        this.enemyBarracks = [];

        // Particles & Debris
        this.debrisList = [];
        this.particlesList = [];

        // Clock & Animation timing
        this.clock = new THREE.Clock();
        this.animTime = 0;

        this.initThree();
        this.createEnvironment();
        this.createTrack();
        this.initCannon();
        this.createAllLevelCourses();
        this.loadPlayerModels();
        this.setupEventListeners();
    }

    initThree() {
        this.scene = new THREE.Scene();
        // Bright, fresh pastel pink background
        const bgColor = 0xffe4ec;
        this.scene.background = new THREE.Color(bgColor);
        this.scene.fog = new THREE.Fog(bgColor, 75, 200);

        this.camera = new THREE.PerspectiveCamera(54, this.width / this.height, 0.1, 350);
        this.camera.position.set(0, 14.5, this.cannonZ - 14.5);
        this.camera.lookAt(0, 1.2, this.cannonZ + 12.0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.13;

        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.zIndex = '1';
        this.container.appendChild(this.renderer.domElement);

        // Balanced ambient and hemisphere fill lighting (sweet spot)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.82);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xfff8fa, 0xfce7f3, 0.42);
        this.scene.add(hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 0.86);
        this.dirLight.position.set(-10, 38, -12);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 150;
        this.dirLight.shadow.camera.left = -20;
        this.dirLight.shadow.camera.right = 20;
        this.dirLight.shadow.camera.top = 60;
        this.dirLight.shadow.camera.bottom = -25;
        this.dirLight.shadow.bias = -0.0004;
        this.scene.add(this.dirLight);
    }

    createEnvironment() {
        // Pastel pink ground extending into the horizon
        const groundGeo = new THREE.PlaneGeometry(260, 400);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0xffe4ec });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.22, 90);
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createTrack() {
        this.trackGroup = new THREE.Group();
        const roadLength = 180;

        // 1. MAIN RUNWAY: Alternating horizontal blocks (Soft White & Gentle Pastel Lavender)
        const canvasMain = document.createElement('canvas');
        canvasMain.width = 256;
        canvasMain.height = 512;
        const ctxMain = canvasMain.getContext('2d');
        // Block 1: Soft White
        ctxMain.fillStyle = '#f8fafc';
        ctxMain.fillRect(0, 0, 256, 256);
        // Block 2: Gentle Pastel Lavender (#e6e0f4)
        ctxMain.fillStyle = '#e6e0f4';
        ctxMain.fillRect(0, 256, 256, 256);

        const mainRoadTex = new THREE.CanvasTexture(canvasMain);
        mainRoadTex.colorSpace = THREE.SRGBColorSpace;
        mainRoadTex.wrapS = THREE.RepeatWrapping;
        mainRoadTex.wrapT = THREE.RepeatWrapping;
        mainRoadTex.repeat.set(1, 40);

        const mainRoadMat = new THREE.MeshStandardMaterial({
            map: mainRoadTex,
            roughness: 0.52,
            metalness: 0.0
        });
        const mainRoadWidth = 7.2;
        const mainRoadGeo = new THREE.BoxGeometry(mainRoadWidth, 0.40, roadLength);
        const mainRoadMesh = new THREE.Mesh(mainRoadGeo, mainRoadMat);
        mainRoadMesh.position.set(0, -0.20, roadLength / 2 - 10);
        mainRoadMesh.receiveShadow = true;
        this.trackGroup.add(mainRoadMesh);

        // 2. Bright Golden Wood Curbs along both edges (X = +3.6 and X = -3.6)
        const curbMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.15 });
        [3.6, -3.6].forEach(cx => {
            const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.48, roadLength), curbMat);
            curb.position.set(cx, -0.16, roadLength / 2 - 10);
            curb.castShadow = true;
            this.trackGroup.add(curb);
        });

        // 3. POINTED GOLDEN WOODEN PICKET FENCES on outer edges (Screen Left at +3.6, Screen Right at -3.6)
        const fenceGoldMat = new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            roughness: 0.25,
            metalness: 0.20
        });

        // Create Pointed Picket Shape (Classical stylized wooden fence)
        const pw = 0.14;
        const ph = 0.65;
        const pth = 0.12;
        const picketShape = new THREE.Shape();
        picketShape.moveTo(-pw / 2, 0);
        picketShape.lineTo(pw / 2, 0);
        picketShape.lineTo(pw / 2, ph);
        picketShape.lineTo(0, ph + pth); // pointed arrowhead tip
        picketShape.lineTo(-pw / 2, ph);
        picketShape.closePath();

        const extrudeSettings = { depth: 0.04, bevelEnabled: false };
        const picketGeo = new THREE.ExtrudeGeometry(picketShape, extrudeSettings);

        [3.6, -3.6].forEach(fx => {
            // Continuous top rail
            const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, roadLength), fenceGoldMat);
            topRail.position.set(fx, 0.46, roadLength / 2 - 10);
            this.trackGroup.add(topRail);

            // Continuous bottom rail
            const botRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, roadLength), fenceGoldMat);
            botRail.position.set(fx, 0.16, roadLength / 2 - 10);
            this.trackGroup.add(botRail);

            // Pointed pickets spaced every 0.38m along the road
            for (let pz = -8; pz < roadLength - 10; pz += 0.38) {
                const picket = new THREE.Mesh(picketGeo, fenceGoldMat);
                picket.position.set(fx, 0.02, pz);
                this.trackGroup.add(picket);
            }
        });

        // 4. Level 1 Starting Baseline at Z = 0
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const lineGeo = new THREE.PlaneGeometry(7.0, 0.25);
        const lineMesh = new THREE.Mesh(lineGeo, lineMat);
        lineMesh.rotation.x = -Math.PI / 2;
        lineMesh.position.set(0, 0.02, 0.0);
        this.trackGroup.add(lineMesh);

        // 5. Level 2 Starting Baseline at Z = 24.0
        const line2Mesh = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
        line2Mesh.rotation.x = -Math.PI / 2;
        line2Mesh.position.set(0, 0.02, 24.0);
        this.trackGroup.add(line2Mesh);

        this.scene.add(this.trackGroup);
    }

    // -----------------------------------------------------------------
    // 3D CANNON PROCEDURAL MODELS (Tier 0 -> Tier 5)
    // -----------------------------------------------------------------
    buildCannonModel(tier, isShowcase = false) {
        const root = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.25, metalness: 0.2 });
        const cyanBrightMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.3 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.3 });
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
        const hubMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2 });
        const yellowGoldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.2, metalness: 0.4 });
        const redTubeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.1 });
        const purpleMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.2, metalness: 0.5 });
        const flashMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0 });

        const wheels = [];
        const barrels = [];
        const muzzleFlashes = [];
        let turret = null;

        const addWheel = (parent, x, y, z, r = 0.32, w = 0.26) => {
            const wGroup = new THREE.Group();
            wGroup.position.set(x, y, z);

            const wheelGeo = new THREE.CylinderGeometry(r, r, w, 16);
            wheelGeo.rotateZ(Math.PI / 2);
            const tire = new THREE.Mesh(wheelGeo, wheelMat);
            tire.castShadow = !isShowcase;
            wGroup.add(tire);

            const hubGeo = new THREE.CylinderGeometry(r * 0.48, r * 0.48, w + 0.02, 12);
            hubGeo.rotateZ(Math.PI / 2);
            const hub = new THREE.Mesh(hubGeo, hubMat);
            wGroup.add(hub);

            parent.add(wGroup);
            wheels.push(wGroup);
            return wGroup;
        };

        if (tier === 0) {
            // --- TIER 0: Single Barrel Starter Cannon ---
            const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 1.4), bodyMat);
            chassis.position.y = 0.38;
            chassis.castShadow = !isShowcase;
            root.add(chassis);

            const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.1), cyanBrightMat);
            topPlate.position.y = 0.62;
            root.add(topPlate);

            turret = new THREE.Group();
            turret.position.set(0, 0.68, 0.0);

            const sphereBase = new THREE.Mesh(new THREE.SphereGeometry(0.50, 18, 18), cyanBrightMat);
            turret.add(sphereBase);

            const barrelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.25, 18), cyanBrightMat);
            barrelMesh.rotation.x = Math.PI / 2;
            barrelMesh.position.set(0, 0.12, 0.68);
            barrelMesh.castShadow = !isShowcase;
            barrelMesh.userData.initPosZ = 0.68;
            turret.add(barrelMesh);
            barrels.push(barrelMesh);

            const muzzleTip = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.06, 10, 18), darkMat);
            muzzleTip.position.set(0, 0.12, 1.30);
            turret.add(muzzleTip);

            const flash = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 10), flashMat.clone());
            flash.position.set(0, 0.12, 1.44);
            turret.add(flash);
            muzzleFlashes.push(flash);

            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55), darkMat);
            ant.position.set(0.24, 0.68, -0.25);
            turret.add(ant);

            const antBall = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), yellowGoldMat);
            antBall.position.set(0.24, 0.96, -0.25);
            turret.add(antBall);

            root.add(turret);

            addWheel(root, -0.88, 0.32, 0.48);
            addWheel(root, 0.88, 0.32, 0.48);
            addWheel(root, -0.88, 0.32, -0.48);
            addWheel(root, 0.88, 0.32, -0.48);

        } else if (tier === 1) {
            // --- TIER 1: Dual-Barrel Cannon (Matches Pedestal 20) ---
            const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.44, 1.5), bodyMat);
            chassis.position.y = 0.38;
            chassis.castShadow = !isShowcase;
            root.add(chassis);

            const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.12, 1.2), cyanBrightMat);
            topPlate.position.y = 0.62;
            root.add(topPlate);

            [-0.88, 0.88].forEach(ax => {
                const sideGuard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 1.0), darkMat);
                sideGuard.position.set(ax, 0.58, 0);
                root.add(sideGuard);
            });

            turret = new THREE.Group();
            turret.position.set(0, 0.68, 0.0);

            const sphereBase = new THREE.Mesh(new THREE.SphereGeometry(0.54, 18, 18), cyanBrightMat);
            turret.add(sphereBase);

            [-0.28, 0.28].forEach(bx => {
                const barrelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 1.25, 16), cyanBrightMat);
                barrelMesh.rotation.x = Math.PI / 2;
                barrelMesh.position.set(bx, 0.12, 0.68);
                barrelMesh.castShadow = !isShowcase;
                barrelMesh.userData.initPosZ = 0.68;
                turret.add(barrelMesh);
                barrels.push(barrelMesh);

                const tip = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 10, 16), darkMat);
                tip.position.set(bx, 0.12, 1.30);
                turret.add(tip);

                const flash = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), flashMat.clone());
                flash.position.set(bx, 0.12, 1.44);
                turret.add(flash);
                muzzleFlashes.push(flash);
            });

            root.add(turret);

            addWheel(root, -0.94, 0.32, 0.50);
            addWheel(root, 0.94, 0.32, 0.50);
            addWheel(root, -0.94, 0.32, -0.50);
            addWheel(root, 0.94, 0.32, -0.50);

        } else if (tier === 2) {
            // --- TIER 2: Triple-Barrel Heavy Cannon (Matches Pedestal 30) ---
            const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.46, 1.6), darkMat);
            chassis.position.y = 0.38;
            chassis.castShadow = !isShowcase;
            root.add(chassis);

            const chassisArmor = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 1.3), cyanBrightMat);
            chassisArmor.position.y = 0.64;
            root.add(chassisArmor);

            const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.22, 0.18), yellowGoldMat);
            bumper.position.set(0, 0.38, 0.85);
            root.add(bumper);

            turret = new THREE.Group();
            turret.position.set(0, 0.70, 0.0);

            const sphereBase = new THREE.Mesh(new THREE.SphereGeometry(0.56, 18, 18), cyanBrightMat);
            turret.add(sphereBase);

            const hoseCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0.60, 0.05, -0.30),
                new THREE.Vector3(0.78, 0.25, 0.0),
                new THREE.Vector3(0.65, 0.45, 0.25),
                new THREE.Vector3(0.42, 0.35, 0.35)
            ]);
            const hoseGeo = new THREE.TubeGeometry(hoseCurve, 16, 0.06, 8, false);
            const hoseMesh = new THREE.Mesh(hoseGeo, redTubeMat);
            turret.add(hoseMesh);

            const barrelPositions = [
                [-0.24, 0.04],
                [0.24, 0.04],
                [0.0, 0.32]
            ];

            barrelPositions.forEach(([bx, by]) => {
                const barrelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.30, 16), cyanBrightMat);
                barrelMesh.rotation.x = Math.PI / 2;
                barrelMesh.position.set(bx, by, 0.70);
                barrelMesh.castShadow = !isShowcase;
                barrelMesh.userData.initPosZ = 0.70;
                turret.add(barrelMesh);
                barrels.push(barrelMesh);

                const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.05, 10, 16), darkMat);
                muzzleRing.position.set(bx, by, 1.34);
                turret.add(muzzleRing);

                const flash = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), flashMat.clone());
                flash.position.set(bx, by, 1.48);
                turret.add(flash);
                muzzleFlashes.push(flash);
            });

            root.add(turret);

            addWheel(root, -0.98, 0.34, 0.52, 0.34, 0.28);
            addWheel(root, 0.98, 0.34, 0.52, 0.34, 0.28);
            addWheel(root, -0.98, 0.34, -0.52, 0.34, 0.28);
            addWheel(root, 0.98, 0.34, -0.52, 0.34, 0.28);

        } else if (tier === 3) {
            // --- TIER 3: Supersonic Jet Fighter (Matches Pedestal 500) ---
            turret = new THREE.Group();
            turret.position.set(0, 0.55, 0.0);

            const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.14, 2.3, 16), cyanBrightMat);
            fuselage.rotation.x = Math.PI / 2;
            fuselage.position.set(0, 0.12, 0.05);
            turret.add(fuselage);

            const nose = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.65, 16), cyanBrightMat);
            nose.rotation.x = Math.PI / 2;
            nose.position.set(0, 0.12, 1.48);
            turret.add(nose);

            const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), darkMat);
            canopy.scale.set(0.75, 0.55, 1.6);
            canopy.position.set(0, 0.34, 0.15);
            turret.add(canopy);

            const rightWing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.85), yellowGoldMat);
            rightWing.position.set(0.80, 0.12, -0.15);
            rightWing.rotation.y = -0.35;
            turret.add(rightWing);

            const leftWing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.85), yellowGoldMat);
            leftWing.position.set(-0.80, 0.12, -0.15);
            leftWing.rotation.y = 0.35;
            turret.add(leftWing);

            [-0.32, 0.32].forEach(tx => {
                const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.45), cyanBrightMat);
                fin.position.set(tx, 0.42, -0.80);
                fin.rotation.z = tx > 0 ? -0.22 : 0.22;
                turret.add(fin);
            });

            [-0.22, 0.22].forEach(ex => {
                const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.35, 14), darkMat);
                exhaust.rotation.x = Math.PI / 2;
                exhaust.position.set(ex, 0.12, -1.15);
                turret.add(exhaust);

                const glow = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
                glow.position.set(ex, 0.12, -1.30);
                turret.add(glow);
            });

            const firingPositions = [
                [-1.25, 0.12, 0.05],
                [-0.22, 0.10, 1.05],
                [0.22, 0.10, 1.05],
                [1.25, 0.12, 0.05]
            ];

            firingPositions.forEach(([fx, fy, fz]) => {
                const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.55, 10), darkMat);
                bl.rotation.x = Math.PI / 2;
                bl.position.set(fx, fy, fz);
                bl.userData.initPosZ = fz;
                turret.add(bl);
                barrels.push(bl);

                const flash = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), flashMat.clone());
                flash.position.set(fx, fy, fz + 0.35);
                turret.add(flash);
                muzzleFlashes.push(flash);
            });

            root.add(turret);

            const hoverPad = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.65, 16), new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.7
            }));
            hoverPad.rotation.x = -Math.PI / 2;
            hoverPad.position.y = 0.08;
            root.add(hoverPad);

        } else if (tier === 4) {
            // --- TIER 4: Plasma Heavy Railgun Tank (Level 2 Pedestal 1) ---
            const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.52, 1.8), darkMat);
            chassis.position.y = 0.42;
            chassis.castShadow = !isShowcase;
            root.add(chassis);

            const reactorPlate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 1.4), purpleMat);
            reactorPlate.position.y = 0.72;
            root.add(reactorPlate);

            turret = new THREE.Group();
            turret.position.set(0, 0.80, 0.0);

            const turretCore = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.80, 0.45, 18), darkMat);
            turret.add(turretCore);

            [-0.38, 0.38].forEach(rx => {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.8), cyanBrightMat);
                rail.position.set(rx, 0.18, 0.85);
                rail.userData.initPosZ = 0.85;
                turret.add(rail);
                barrels.push(rail);

                const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16), new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
                glowRing.position.set(rx, 0.18, 1.45);
                turret.add(glowRing);

                const flash = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), flashMat.clone());
                flash.position.set(rx, 0.18, 1.80);
                turret.add(flash);
                muzzleFlashes.push(flash);
            });

            const centerBlaster = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 12), yellowGoldMat);
            centerBlaster.rotation.x = Math.PI / 2;
            centerBlaster.position.set(0, 0.28, 0.70);
            centerBlaster.userData.initPosZ = 0.70;
            turret.add(centerBlaster);
            barrels.push(centerBlaster);

            root.add(turret);

            addWheel(root, -1.1, 0.38, 0.60, 0.38, 0.34);
            addWheel(root, 1.1, 0.38, 0.60, 0.38, 0.34);
            addWheel(root, -1.1, 0.38, -0.60, 0.38, 0.34);
            addWheel(root, 1.1, 0.38, -0.60, 0.38, 0.34);

        } else if (tier >= 5) {
            // --- TIER 5: Orbital Hyper Gunship (Level 2 Pedestal 2) ---
            turret = new THREE.Group();
            turret.position.set(0, 0.60, 0.0);

            const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 2.6), darkMat);
            fuselage.position.set(0, 0.15, 0.0);
            turret.add(fuselage);

            const goldNose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 4), yellowGoldMat);
            goldNose.rotation.x = Math.PI / 2;
            goldNose.rotation.y = Math.PI / 4;
            goldNose.position.set(0, 0.15, 1.6);
            turret.add(goldNose);

            [-1.4, 1.4].forEach(wx => {
                const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.2), cyanBrightMat);
                wing.position.set(wx > 0 ? 0.95 : -0.95, 0.15, -0.1);
                wing.rotation.y = wx > 0 ? -0.4 : 0.4;
                turret.add(wing);

                const tipBlaster = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.8, 10), purpleMat);
                tipBlaster.rotation.x = Math.PI / 2;
                tipBlaster.position.set(wx, 0.15, 0.3);
                tipBlaster.userData.initPosZ = 0.3;
                turret.add(tipBlaster);
                barrels.push(tipBlaster);

                const flash = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), flashMat.clone());
                flash.position.set(wx, 0.15, 0.75);
                turret.add(flash);
                muzzleFlashes.push(flash);
            });

            [-0.30, 0.30].forEach(nx => {
                const noseCannon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.9, 10), yellowGoldMat);
                noseCannon.rotation.x = Math.PI / 2;
                noseCannon.position.set(nx, 0.12, 1.2);
                noseCannon.userData.initPosZ = 1.2;
                turret.add(noseCannon);
                barrels.push(noseCannon);

                const flash = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), flashMat.clone());
                flash.position.set(nx, 0.12, 1.7);
                turret.add(flash);
                muzzleFlashes.push(flash);
            });

            root.add(turret);

            const hoverPad = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.85, 16), new THREE.MeshBasicMaterial({
                color: 0xa855f7,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8
            }));
            hoverPad.rotation.x = -Math.PI / 2;
            hoverPad.position.y = 0.06;
            root.add(hoverPad);
        }

        if (isShowcase) {
            root.scale.set(0.68, 0.68, 0.68);
        }

        return {
            mesh: root,
            turret: turret,
            barrels: barrels,
            muzzleFlashes: muzzleFlashes,
            wheels: wheels,
            tier: tier
        };
    }

    initCannon() {
        this.cannonGroup = new THREE.Group();
        this.cannonGroup.position.set(this.cannonX, 0, this.cannonZ);
        this.scene.add(this.cannonGroup);

        this.setPlayerCannonTier(0);
    }

    setPlayerCannonTier(tier) {
        this.currentCannonTier = tier;
        this.soldiersPerShot = 1 + tier;

        while (this.cannonGroup.children.length > 0) {
            this.cannonGroup.remove(this.cannonGroup.children[0]);
        }

        const cannonData = this.buildCannonModel(tier, false);
        this.activeCannonData = cannonData;
        this.cannonGroup.add(cannonData.mesh);
        this.wheels = cannonData.wheels || [];
        this.cannonTurret = cannonData.turret;
        this.cannonBarrels = cannonData.barrels || [];
        this.muzzleFlashes = cannonData.muzzleFlashes || [];

        this.cannonGroup.scale.set(1.35, 1.35, 1.35);

        this.spawnSparkBurst(this.cannonX, 1.0, this.cannonZ, 0xfacc15);
        this.spawnSparkBurst(this.cannonX, 1.0, this.cannonZ, 0x38bdf8);

        this.onTierUpgrade(tier);
    }

    // -----------------------------------------------------------------
    // CREATE ALL LEVEL COURSES AT START (Level 2 visible in background)
    // -----------------------------------------------------------------
    createAllLevelCourses() {
        this.levelBaselineZ = 0.0;

        // ==================== LEVEL 1 (Active) ====================
        // 1. GATE 1 (Left: x2) at Z = 6.5, X = -1.8
        const gate1 = this.createMultiplierGate('gate_1', -1.8, 6.5, 2.6, { type: 'mult', val: 2, label: 'x2' }, 1);
        this.gates.push(gate1);

        // 2. GATE 2 (Left: x3) at Z = 9.5, X = -1.8
        const gate2 = this.createMultiplierGate('gate_2', -1.8, 9.5, 2.6, { type: 'mult', val: 3, label: 'x3' }, 1);
        this.gates.push(gate2);

        // 3. RED ENEMY BARRACKS (HP 200 - Castle) at Z = 16.5, X = -1.8
        const barracks1 = this.createEnemyBarracks({
            x: -1.8,
            z: 16.5,
            width: 2.5,
            height: 3.2,
            depth: 2.2,
            hp: 200,
            maxHp: 200,
            spawnInterval: 0.65,
            level: 1,
            id: 'barracks_lv1'
        });
        this.enemyBarracks.push(barracks1);

        // 4. RIGHT PEDESTAL 1 (HP 20) with Tier 1 Dual Cannon at Z = 6.5, X = 1.95
        const yellowBlock1 = this.createYellowTierBlock({
            tier: 1,
            x: 1.95,
            z: 6.5,
            width: 2.3,
            height: 1.4,
            depth: 1.6,
            hp: 20,
            level: 1,
            id: 'tier_block_1'
        });
        this.yellowBlocks.push(yellowBlock1);

        // 5. RIGHT PEDESTAL 2 (HP 30) with Tier 2 Triple Cannon at Z = 9.5, X = 1.95
        const yellowBlock2 = this.createYellowTierBlock({
            tier: 2,
            x: 1.95,
            z: 9.5,
            width: 2.3,
            height: 1.8,
            depth: 1.6,
            hp: 30,
            level: 1,
            id: 'tier_block_2'
        });
        this.yellowBlocks.push(yellowBlock2);

        // 6. RIGHT PEDESTAL 3 (HP 500) with Tier 3 Supersonic Jet at Z = 12.5, X = 1.95
        const yellowBlock3 = this.createYellowTierBlock({
            tier: 3,
            x: 1.95,
            z: 12.5,
            width: 2.3,
            height: 2.2,
            depth: 1.6,
            hp: 500,
            level: 1,
            id: 'tier_block_3'
        });
        this.yellowBlocks.push(yellowBlock3);

        // ==================== LEVEL 2 (Visible in background, dormant until activated) ====================
        // 7. Moving Gate 1: (Oscillating x3 multiplier) at Z = 31.0
        const moveGate1 = this.createMultiplierGate('gate_lv2_1', 0, 31.0, 2.4, {
            type: 'mult',
            val: 3,
            label: 'x3',
            moving: true,
            baseX: 0,
            moveRange: 2.2,
            moveSpeed: 1.6
        }, 2);
        this.gates.push(moveGate1);

        // 8. Hazard Penalty Gate: (Red moving /2 danger gate) at Z = 35.0
        const hazardGate = this.createMultiplierGate('gate_lv2_hazard', 0, 35.0, 2.4, {
            type: 'div',
            val: 2,
            label: '/2',
            moving: true,
            baseX: 0,
            moveRange: -2.2,
            moveSpeed: 1.6
        }, 2);
        this.gates.push(hazardGate);

        // 9. Super Multiplier Gate (x4) at Z = 39.5
        const moveGate2 = this.createMultiplierGate('gate_lv2_2', -1.2, 39.5, 2.2, {
            type: 'mult',
            val: 4,
            label: 'x4'
        }, 2);
        this.gates.push(moveGate2);

        // 10. LEVEL 2 PEDESTAL 1 (HP 80 - Tier 4 Plasma Railgun) at Z = 31.0, X = 1.95
        const lv2Block1 = this.createYellowTierBlock({
            tier: 4,
            x: 1.95,
            z: 31.0,
            width: 2.3,
            height: 1.6,
            depth: 1.6,
            hp: 80,
            level: 2,
            id: 'tier_block_4'
        });
        this.yellowBlocks.push(lv2Block1);

        // 11. LEVEL 2 PEDESTAL 2 (HP 1500 - Tier 5 Hyper Gunship) at Z = 39.5, X = 1.95
        const lv2Block2 = this.createYellowTierBlock({
            tier: 5,
            x: 1.95,
            z: 39.5,
            width: 2.3,
            height: 2.2,
            depth: 1.6,
            hp: 1500,
            level: 2,
            id: 'tier_block_5'
        });
        this.yellowBlocks.push(lv2Block2);

        // 12. ENEMY OUTPOST LEFT (HP 250) at Z = 45.0, X = -1.9
        const outpostLeft = this.createEnemyBarracks({
            x: -1.9,
            z: 45.0,
            width: 2.2,
            height: 2.8,
            depth: 2.0,
            hp: 250,
            maxHp: 250,
            spawnInterval: 0.45,
            level: 2,
            id: 'barracks_lv2_left'
        });
        this.enemyBarracks.push(outpostLeft);

        // 13. ENEMY OUTPOST RIGHT (HP 250) at Z = 45.0, X = 1.8
        const outpostRight = this.createEnemyBarracks({
            x: 1.8,
            z: 45.0,
            width: 2.2,
            height: 2.8,
            depth: 2.0,
            hp: 250,
            maxHp: 250,
            spawnInterval: 0.45,
            level: 2,
            id: 'barracks_lv2_right'
        });
        this.enemyBarracks.push(outpostRight);

        // 14. FINAL BOSS GRAND CITADEL (HP 800) at Z = 55.0, X = 0.0
        const bossCitadel = this.createEnemyBarracks({
            x: 0.0,
            z: 55.0,
            width: 3.2,
            height: 3.8,
            depth: 2.6,
            hp: 800,
            maxHp: 800,
            spawnInterval: 0.35,
            level: 2,
            id: 'barracks_boss'
        });
        this.enemyBarracks.push(bossCitadel);
    }

    // -----------------------------------------------------------------
    // TRANSITION TO LEVEL 2: DESTROY ALL LEVEL 1, DRIVE TO LEVEL 2 LINE
    // -----------------------------------------------------------------
    advanceToNextLevel() {
        if (this.isLevelTransitioning) return;
        this.isLevelTransitioning = true;

        // 1. Destroy all remaining Level 1 items with debris & explosions
        this.yellowBlocks.forEach(block => {
            if (block.level === 1 && !block.isDestroyed) {
                block.isDestroyed = true;
                this.spawnDebrisExplosion(block.group.position, 0xfacc15, 14);
                block.group.visible = false;
            }
        });

        this.gates.forEach(g => {
            if (g.level === 1) {
                this.spawnSparkBurst(g.x, 1.0, g.z, 0x38bdf8);
                this.scene.remove(g.group);
            }
        });

        this.alliedMobs.forEach(m => {
            this.spawnSparkBurst(m.x, 0.5, m.z, 0x38bdf8);
            this.scene.remove(m.model);
        });
        this.alliedMobs = [];

        this.enemyMobs.forEach(m => {
            this.spawnSparkBurst(m.x, 0.5, m.z, 0xef4444);
            this.scene.remove(m.model);
        });
        this.enemyMobs = [];

        this.onLevelTransition(2);

        // 2. Drive cannon forward to Level 2 starting position (Z = 22.0, behind the line at Z = 24.0)
        const startZ = this.cannonZ;
        const targetZ = 22.0;
        const duration = 1.8;
        let elapsed = 0;

        const transitionInterval = (dt) => {
            elapsed += dt;
            const t = Math.min(1.0, elapsed / duration);
            // Smooth easeInOutCubic
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            this.cannonZ = startZ + (targetZ - startZ) * ease;
            this.cannonGroup.position.z = this.cannonZ;

            // Fast wheel spinning during drive
            this.wheels.forEach(w => {
                w.rotation.x += dt * 28;
            });

            // Camera smoothly glides forward directly behind cannon with identical framing to Level 1
            this.camera.position.set(0, 14.5, this.cannonZ - 14.5);
            this.camera.lookAt(0, 1.2, this.cannonZ + 12.0);

            // Speed thruster sparks
            if (Math.random() < 0.75) {
                this.spawnSparkBurst(this.cannonGroup.position.x, 0.3, this.cannonGroup.position.z - 1.2, 0x38bdf8);
                this.spawnSparkBurst(this.cannonGroup.position.x, 0.3, this.cannonGroup.position.z - 1.2, 0xfacc15);
            }

            if (t >= 1.0) {
                this.isLevelTransitioning = false;
                this.levelTransitionUpdater = null;
                this.targetCannonX = 0;
                this.cannonX = 0;
                this.cannonGroup.position.x = 0;

                // 3. Activate Level 2
                this.activateLevel2();
            }
        };

        this.levelTransitionUpdater = transitionInterval;
    }

    activateLevel2() {
        this.currentLevel = 2;
        this.cannonZ = 22.0;
        this.cannonGroup.position.z = 22.0;
        this.levelBaselineZ = 24.0;

        // Ensure camera framing is 100% matched to Level 1
        this.camera.position.set(0, 14.5, this.cannonZ - 14.5);
        this.camera.lookAt(0, 1.2, this.cannonZ + 12.0);

        // Unlock Level 2 gates
        this.gates.forEach(g => {
            if (g.level === 2) {
                g.isLocked = false;
                if (g.energyMat) g.energyMat.opacity = 0.65;
                this.spawnSparkBurst(g.x, 1.2, g.z, 0x38bdf8);
            }
        });

        // Unlock Level 2 yellow blocks
        this.yellowBlocks.forEach(b => {
            if (b.level === 2) {
                b.isLocked = false;
                this.spawnSparkBurst(b.x, 1.0, b.z, 0xfacc15);
            }
        });

        // Unlock Level 2 enemy fortresses
        this.enemyBarracks.forEach(b => {
            if (b.level === 2) {
                b.isLocked = false;
                b.spawnTimer = 0;
                this.spawnSparkBurst(b.x, 1.5, b.z, 0xef4444);
            }
        });

        this.onLevelStart(2);
    }

    createMultiplierGate(id, x, z, width, data, level = 1) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const isHazard = data.type === 'sub' || data.type === 'div';
        const isGreenTheme = !isHazard && (data.val >= 3 || data.type === 'mult');
        const height = 1.6;

        let frameColor = 0x0284c7;
        if (isHazard) frameColor = 0xef4444;
        else if (isGreenTheme) frameColor = 0x10b981;

        const frameMat = new THREE.MeshStandardMaterial({
            color: frameColor,
            roughness: 0.3,
            metalness: 0.2
        });

        const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.12), frameMat);
        p1.position.set(-width / 2 + 0.06, height / 2, 0);
        group.add(p1);

        const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.12), frameMat);
        p2.position.set(width / 2 - 0.06, height / 2, 0);
        group.add(p2);

        let energyColor = 0x38bdf8;
        if (isHazard) energyColor = 0xf87171;
        else if (isGreenTheme) energyColor = 0x34d399;

        const isLocked = level > 1;
        const energyMat = new THREE.MeshBasicMaterial({
            color: energyColor,
            transparent: true,
            opacity: isLocked ? 0.30 : 0.65,
            side: THREE.DoubleSide
        });
        const energyMesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.15, height * 0.7), energyMat);
        energyMesh.position.set(0, height * 0.45, 0);
        group.add(energyMesh);

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        if (isHazard) {
            grad.addColorStop(0, '#ef4444');
            grad.addColorStop(1, '#991b1b');
        } else if (isGreenTheme) {
            grad.addColorStop(0, '#10b981');
            grad.addColorStop(1, '#047857');
        } else {
            grad.addColorStop(0, '#0ea5e9');
            grad.addColorStop(1, '#0284c7');
        }
        ctx.fillStyle = grad;
        this.roundRect(ctx, 12, 12, 488, 232, 32, true, false);

        ctx.lineWidth = 18;
        ctx.strokeStyle = '#ffffff';
        this.roundRect(ctx, 12, 12, 488, 232, 32, false, true);

        ctx.font = '900 135px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.lineWidth = 26;
        ctx.strokeStyle = isHazard ? '#450a0a' : (isGreenTheme ? '#064e3b' : '#082f49');
        ctx.lineJoin = 'round';
        ctx.strokeText(data.label, 256, 128);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(data.label, 256, 128);

        const labelTex = new THREE.CanvasTexture(canvas);
        labelTex.needsUpdate = true;

        const labelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width * 0.95, 1.15),
            new THREE.MeshBasicMaterial({
                map: labelTex,
                transparent: true,
                side: THREE.FrontSide
            })
        );
        labelMesh.position.set(0, height + 0.35, 0);
        labelMesh.rotation.set(0.65, Math.PI, 0);
        group.add(labelMesh);

        this.scene.add(group);

        return {
            id: id,
            level: level,
            isLocked: isLocked,
            group: group,
            energyMat: energyMat,
            x: x,
            z: z,
            width: width,
            data: data,
            onPass: () => {
                energyMat.opacity = 1.0;
                setTimeout(() => { energyMat.opacity = isLocked ? 0.30 : 0.65; }, 150);
            }
        };
    }

    createYellowTierBlock(config) {
        const group = new THREE.Group();
        group.position.set(config.x, 0, config.z);

        const isLocked = (config.level || 1) > 1;
        const totalHeight = config.height || 1.8;
        const radius = (config.width || 2.2) / 2;

        // 1. Generate Seamless Diamond-Engraved Stone Texture (matching Image 1)
        const canvasBrick = document.createElement('canvas');
        canvasBrick.width = 512;
        canvasBrick.height = 512;
        const bCtx = canvasBrick.getContext('2d');

        bCtx.fillStyle = '#52525b';
        bCtx.fillRect(0, 0, 512, 512);

        const cols = 8;
        const rows = 8;
        const cellW = 512 / cols;
        const cellH = 512 / rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = c * cellW;
                const y = r * cellH;

                // Dark stone tile
                bCtx.fillStyle = '#4b5563';
                bCtx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

                // Bevel border highlight
                bCtx.strokeStyle = '#6b7280';
                bCtx.lineWidth = 1.5;
                bCtx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);

                // Center diamond engraving
                const cx = x + cellW / 2;
                const cy = y + cellH / 2;
                const dw = cellW * 0.28;
                const dh = cellH * 0.28;

                bCtx.fillStyle = '#78716c';
                bCtx.beginPath();
                bCtx.moveTo(cx, cy - dh);
                bCtx.lineTo(cx + dw, cy);
                bCtx.lineTo(cx, cy + dh);
                bCtx.lineTo(cx - dw, cy);
                bCtx.closePath();
                bCtx.fill();

                bCtx.strokeStyle = '#374151';
                bCtx.lineWidth = 1;
                bCtx.stroke();
            }
        }

        const stoneTex = new THREE.CanvasTexture(canvasBrick);
        stoneTex.wrapS = THREE.RepeatWrapping;
        stoneTex.wrapT = THREE.RepeatWrapping;
        stoneTex.repeat.set(2, 1);

        const cylinderMat = new THREE.MeshStandardMaterial({
            map: stoneTex,
            roughness: 0.50,
            metalness: 0.15
        });

        // 2. Generate Golden Core & Brown Top Textures
        const canvasGold = document.createElement('canvas');
        canvasGold.width = 256;
        canvasGold.height = 64;
        const gCtx = canvasGold.getContext('2d');
        gCtx.fillStyle = '#f59e0b';
        gCtx.fillRect(0, 0, 256, 64);
        for (let x = 0; x < 256; x += 32) {
            gCtx.fillStyle = '#fbbf24';
            gCtx.fillRect(x + 2, 2, 28, 60);
            gCtx.fillStyle = '#fef08a';
            gCtx.beginPath();
            const cx = x + 16;
            const cy = 32;
            gCtx.moveTo(cx, cy - 14);
            gCtx.lineTo(cx + 8, cy);
            gCtx.lineTo(cx, cy + 14);
            gCtx.lineTo(cx - 8, cy);
            gCtx.closePath();
            gCtx.fill();
        }
        const goldTex = new THREE.CanvasTexture(canvasGold);
        goldTex.wrapS = THREE.RepeatWrapping;
        goldTex.wrapT = THREE.ClampToEdgeWrapping;
        goldTex.repeat.set(2, 1);
        const goldMat = new THREE.MeshStandardMaterial({ map: goldTex, roughness: 0.35, metalness: 0.3 });

        const brownTopMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.6 });

        // 3. Build Multi-Piece Seamless Cylindrical Rows (Multiple small pieces per row)
        const numRows = Math.max(4, Math.min(6, Math.ceil(config.hp / 6)));
        const piecesPerRow = 8;
        const totalPieces = numRows * piecesPerRow;
        const rowHeight = totalHeight / numRows;

        // Inner solid core
        const coreMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.7 });
        const coreMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, totalHeight * 0.98, 24), coreMat);
        coreMesh.position.y = totalHeight / 2;
        group.add(coreMesh);

        // Store all small pieces ordered from Top Row down to Bottom Row
        const allPieces = [];

        for (let r = numRows - 1; r >= 0; r--) {
            const rowY = (r + 0.5) * rowHeight;
            const thetaStep = (Math.PI * 2) / piecesPerRow;

            for (let p = 0; p < piecesPerRow; p++) {
                const thetaStart = p * thetaStep;
                const thetaCenter = thetaStart + thetaStep / 2;

                // Seamless curved cylinder segment
                const pieceGeo = new THREE.CylinderGeometry(radius, radius, rowHeight * 0.99, 4, 1, false, thetaStart, thetaStep);
                const pieceMesh = new THREE.Mesh(pieceGeo, cylinderMat);
                pieceMesh.position.y = rowY;
                pieceMesh.castShadow = true;
                pieceMesh.receiveShadow = true;

                pieceMesh.userData = {
                    row: r,
                    y: rowY,
                    angleCenter: thetaCenter
                };

                group.add(pieceMesh);
                allPieces.push(pieceMesh);
            }
        }

        // 4. Raised Golden Core Platform with Brown Top Center (matching Image 1)
        const coreGroup = new THREE.Group();
        coreGroup.position.y = totalHeight;

        // Golden raised ring
        const goldRimMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.76, radius * 0.76, 0.22, 32), goldMat);
        goldRimMesh.position.y = 0.11;
        coreGroup.add(goldRimMesh);

        // Brown center disc on top
        const brownCenterMesh = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.60, 32), brownTopMat);
        brownCenterMesh.rotation.x = -Math.PI / 2;
        brownCenterMesh.position.y = 0.221;
        coreGroup.add(brownCenterMesh);

        group.add(coreGroup);

        // 5. Showcase Upgrade Cannon on top
        const showcaseData = this.buildCannonModel(config.tier, true);
        const showcaseMesh = showcaseData.mesh;
        showcaseMesh.position.set(0, totalHeight + 0.24, 0);
        group.add(showcaseMesh);

        // 6. Floating HP Badge in front (matching Image 1)
        const canvas = document.createElement('canvas');
        canvas.width = 280;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');

        const updateLabel = (hp) => {
            ctx.clearRect(0, 0, 280, 180);

            // Clean bold white number with thick outline
            ctx.font = '900 110px "Arial Black", Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 22;
            ctx.strokeStyle = '#0f172a';
            ctx.lineJoin = 'round';
            ctx.strokeText(`${Math.max(0, Math.ceil(hp))}`, 140, 90);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${Math.max(0, Math.ceil(hp))}`, 140, 90);
        };
        updateLabel(config.hp);

        const labelTex = new THREE.CanvasTexture(canvas);
        const labelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 0.90),
            new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, side: THREE.FrontSide })
        );
        labelMesh.position.set(0, totalHeight * 0.5 + 0.1, -radius - 0.08);
        labelMesh.rotation.set(0, Math.PI, 0);
        group.add(labelMesh);

        this.scene.add(group);

        // Small flying cube geometry for flying debris
        const debrisCubeGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);

        const blockObj = {
            id: config.id,
            level: config.level || 1,
            isLocked: isLocked,
            tier: config.tier,
            group: group,
            showcaseMesh: showcaseMesh,
            x: config.x,
            z: config.z,
            width: config.width || 2.2,
            height: totalHeight,
            depth: config.depth || 2.2,
            hp: config.hp,
            maxHp: config.hp,
            isDestroyed: false,
            onHit: (dmg = 1) => {
                updateLabel(blockObj.hp);
                labelTex.needsUpdate = true;

                // Calculate target remaining pieces
                const targetRemaining = Math.max(0, Math.ceil((blockObj.hp / blockObj.maxHp) * totalPieces));

                // Pop individual small pieces from top to bottom
                while (allPieces.length > targetRemaining) {
                    const poppedPiece = allPieces.shift();
                    const u = poppedPiece.userData;

                    const pieceWorldPos = new THREE.Vector3(
                        config.x + Math.cos(u.angleCenter) * radius * 0.88,
                        u.y,
                        config.z + Math.sin(u.angleCenter) * radius * 0.88
                    );

                    group.remove(poppedPiece);

                    // Spawn flying 3D stone cube bursting out (matching Image 1 flying cubes)
                    const flyingCube = new THREE.Mesh(debrisCubeGeo, cylinderMat);
                    flyingCube.position.copy(pieceWorldPos);

                    const outAngle = u.angleCenter;
                    flyingCube.userData = {
                        vx: Math.cos(outAngle) * (3.5 + Math.random() * 3),
                        vy: 4.0 + Math.random() * 3.5,
                        vz: Math.sin(outAngle) * (3.5 + Math.random() * 3),
                        rotX: (Math.random() - 0.5) * 12,
                        rotY: (Math.random() - 0.5) * 12,
                        life: 1.1
                    };
                    this.scene.add(flyingCube);
                    this.debrisList.push(flyingCube);

                    // Sparks bursting at point of impact
                    this.spawnSparkBurst(pieceWorldPos.x, pieceWorldPos.y, pieceWorldPos.z, 0xfacc15);
                    this.spawnSparkBurst(pieceWorldPos.x, pieceWorldPos.y, pieceWorldPos.z, 0xffffff);
                }

                // Check highest remaining row to adjust cannon height
                let currentHighestY = 0;
                for (let p of allPieces) {
                    if (p.userData.y > currentHighestY) {
                        currentHighestY = p.userData.y;
                    }
                }

                if (currentHighestY > 0) {
                    const topY = currentHighestY + rowHeight * 0.5;
                    coreGroup.position.y = topY;
                    showcaseMesh.position.y = topY + 0.24;
                    coreMesh.scale.y = Math.max(0.2, topY / totalHeight);
                    coreMesh.position.y = topY / 2;
                }

                // Subtle punch bounce
                group.scale.set(1.05, 0.96, 1.05);
                setTimeout(() => {
                    if (group) group.scale.set(1.0, 1.0, 1.0);
                }, 60);
            },
            onDestroy: () => {
                this.spawnDebrisExplosion(new THREE.Vector3(config.x, totalHeight / 2, config.z), 0x64748b, 24);
                this.spawnDebrisExplosion(new THREE.Vector3(config.x, totalHeight / 2, config.z), 0xfacc15, 16);
                group.visible = false;
            }
        };

        return blockObj;
    }

    createEnemyBarracks(config) {
        const group = new THREE.Group();
        group.position.set(config.x, 0, config.z);

        const isLocked = (config.level || 1) > 1;

        // Colors matching reference image
        const cyanMat = new THREE.MeshStandardMaterial({ color: 0x81d4fa, roughness: 0.35, metalness: 0.1 });
        const darkNavyMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.4, metalness: 0.2 });
        const tanSkinMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45 });
        const blueShortsMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
        const redClubMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
        const goldRivetMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.3 });

        // 1. ROUNDED CYAN PODIUM STAGE (Base)
        const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.48, 0.30, 32), cyanMat);
        baseMesh.position.y = 0.15;
        baseMesh.receiveShadow = true;
        group.add(baseMesh);

        // 2. SUPPORT POSTS & FINIALS (Left & Right)
        [-1.18, 1.18].forEach(px => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 2.3, 16), cyanMat);
            post.position.set(px, 1.30, 0);
            post.castShadow = true;
            group.add(post);

            const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), cyanMat);
            finial.position.set(px, 2.45, 0);
            group.add(finial);

            // Curved side support bracket arms
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 12), cyanMat);
            arm.position.set(px > 0 ? px - 0.20 : px + 0.20, 1.65, 0);
            arm.rotation.z = px > 0 ? -Math.PI / 4 : Math.PI / 4;
            group.add(arm);
        });

        // 3. SPEEDOMETER / GAUGE DIAL (Center)
        const dialGroup = new THREE.Group();
        dialGroup.position.set(0, 1.65, 0);

        // Outer Dark Navy Casing
        const casing = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.22, 32), darkNavyMat);
        casing.rotation.x = Math.PI / 2;
        casing.castShadow = true;
        dialGroup.add(casing);

        // Dial Face (Cream background with graduation ticks)
        const dialCanvas = document.createElement('canvas');
        dialCanvas.width = 512;
        dialCanvas.height = 512;
        const dCtx = dialCanvas.getContext('2d');

        // Draw Cream Dial Face
        dCtx.fillStyle = '#fffef0';
        dCtx.beginPath();
        dCtx.arc(256, 256, 240, 0, Math.PI * 2);
        dCtx.fill();

        // Outer dark ring
        dCtx.lineWidth = 18;
        dCtx.strokeStyle = '#1e3a5f';
        dCtx.stroke();

        // Draw Graduation Tick Marks
        for (let i = 0; i < 24; i++) {
            const angle = (i * Math.PI * 2) / 24;
            const isMajor = i % 2 === 0;
            const rInner = isMajor ? 175 : 198;
            const rOuter = 228;

            const x1 = 256 + Math.cos(angle) * rInner;
            const y1 = 256 + Math.sin(angle) * rInner;
            const x2 = 256 + Math.cos(angle) * rOuter;
            const y2 = 256 + Math.sin(angle) * rOuter;

            dCtx.lineWidth = isMajor ? 12 : 6;
            dCtx.strokeStyle = '#1e293b';
            dCtx.beginPath();
            dCtx.moveTo(x1, y1);
            dCtx.lineTo(x2, y2);
            dCtx.stroke();
        }

        // Center hub
        dCtx.fillStyle = '#0f172a';
        dCtx.beginPath();
        dCtx.arc(256, 256, 28, 0, Math.PI * 2);
        dCtx.fill();

        const dialTex = new THREE.CanvasTexture(dialCanvas);
        const dialFace = new THREE.Mesh(
            new THREE.CircleGeometry(0.96, 32),
            new THREE.MeshBasicMaterial({ map: dialTex, side: THREE.FrontSide })
        );
        dialFace.position.set(0, 0, -0.12);
        dialFace.rotation.y = Math.PI;
        dialGroup.add(dialFace);

        // 3D Bright Red Needle Pointer
        const needleGroup = new THREE.Group();
        needleGroup.position.set(0, 0, -0.13);

        const needleMesh = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 0.72, 12),
            new THREE.MeshBasicMaterial({ color: 0xef4444 })
        );
        needleMesh.position.y = 0.36;
        needleMesh.rotation.z = Math.PI;
        needleGroup.add(needleMesh);

        const needlePin = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0x0f172a })
        );
        needleGroup.add(needlePin);
        needleGroup.rotation.z = 0.75; // Pointing to ~10 o'clock position
        dialGroup.add(needleGroup);

        group.add(dialGroup);

        // 4. TRAINING CHARACTER DUMMY (In front of dial)
        const dummyGroup = new THREE.Group();
        dummyGroup.position.set(0, 0.30, -0.32);

        // Base Pedestal with rivets
        const dummyBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.24, 16), cyanMat);
        dummyBase.position.y = 0.12;
        dummyGroup.add(dummyBase);

        for (let a = 0; a < 6; a++) {
            const angle = (a * Math.PI * 2) / 6;
            const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), goldRivetMat);
            rivet.position.set(Math.cos(angle) * 0.34, 0.12, Math.sin(angle) * 0.34);
            dummyGroup.add(rivet);
        }

        // Dummy Torso
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.17, 0.40, 16), tanSkinMat);
        torso.position.y = 0.48;
        dummyGroup.add(torso);

        // Blue Shorts
        const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.16, 16), blueShortsMat);
        shorts.position.y = 0.32;
        dummyGroup.add(shorts);

        // Legs
        [-0.08, 0.08].forEach(lx => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12), tanSkinMat);
            leg.position.set(lx, 0.18, 0);
            dummyGroup.add(leg);
        });

        // Dummy Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), tanSkinMat);
        head.position.y = 0.82;
        dummyGroup.add(head);

        // Arms holding red clubs
        [-0.26, 0.26].forEach(ax => {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 8), tanSkinMat);
            arm.position.set(ax, 0.50, -0.06);
            arm.rotation.z = ax > 0 ? -Math.PI / 4 : Math.PI / 4;
            arm.rotation.x = Math.PI / 6;
            dummyGroup.add(arm);

            const club = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.38, 8), redClubMat);
            club.position.set(ax > 0 ? ax + 0.14 : ax - 0.14, 0.36, -0.16);
            club.rotation.z = ax > 0 ? -Math.PI / 3 : Math.PI / 3;
            dummyGroup.add(club);
        });

        group.add(dummyGroup);

        // 5. FLOATING CAPSULE HP BAR (With actual HP number replacing Level text)
        const hpCanvas = document.createElement('canvas');
        hpCanvas.width = 512;
        hpCanvas.height = 160;
        const hpCtx = hpCanvas.getContext('2d');

        const updateHpLabel = (hp, maxHp) => {
            hpCtx.clearRect(0, 0, 512, 160);

            const x = 16, y = 20, w = 480, h = 120, r = 60;
            const ratio = Math.max(0, Math.min(1.0, hp / maxHp));

            // Background pill (unfilled dark slate-blue)
            hpCtx.fillStyle = '#64748b';
            this.roundRect(hpCtx, x, y, w, h, r, true, false);

            // Active HP Fill with smooth gradient
            if (ratio > 0) {
                hpCtx.save();
                this.roundRect(hpCtx, x, y, w, h, r, false, false);
                hpCtx.clip();

                const grad = hpCtx.createLinearGradient(x, y, x + w, y);
                grad.addColorStop(0.0, '#ef4444');
                grad.addColorStop(0.35, '#f97316');
                grad.addColorStop(0.75, '#facc15');
                grad.addColorStop(1.0, '#eab308');
                hpCtx.fillStyle = grad;
                hpCtx.fillRect(x, y, w * ratio, h);

                hpCtx.restore();
            }

            // Dark rounded border
            hpCtx.lineWidth = 14;
            hpCtx.strokeStyle = '#0f172a';
            this.roundRect(hpCtx, x, y, w, h, r, false, true);

            // Center HP number
            hpCtx.font = '900 70px "Arial Black", Impact, sans-serif';
            hpCtx.textAlign = 'center';
            hpCtx.textBaseline = 'middle';
            hpCtx.lineWidth = 18;
            hpCtx.strokeStyle = '#0f172a';
            hpCtx.lineJoin = 'round';
            hpCtx.strokeText(`${Math.max(0, Math.ceil(hp))}`, 256, 80);
            hpCtx.fillStyle = '#ffffff';
            hpCtx.fillText(`${Math.max(0, Math.ceil(hp))}`, 256, 80);
        };
        updateHpLabel(config.hp, config.maxHp || config.hp);

        const hpTex = new THREE.CanvasTexture(hpCanvas);
        hpTex.needsUpdate = true;

        const hpScreen = new THREE.Mesh(
            new THREE.PlaneGeometry(2.35, 0.74),
            new THREE.MeshBasicMaterial({ map: hpTex, transparent: true, side: THREE.FrontSide })
        );
        hpScreen.position.set(0, 3.25, -0.15);
        hpScreen.rotation.set(0, Math.PI, 0);
        group.add(hpScreen);

        this.scene.add(group);

        const barracksObj = {
            id: config.id,
            level: config.level || 1,
            isLocked: isLocked,
            group: group,
            x: config.x,
            z: config.z,
            width: 2.8,
            depth: 2.4,
            hp: config.hp,
            maxHp: config.maxHp || config.hp,
            spawnInterval: config.spawnInterval,
            spawnTimer: 0,
            isDestroyed: false,
            onHit: () => {
                updateHpLabel(barracksObj.hp, barracksObj.maxHp);
                hpTex.needsUpdate = true;

                // Needle shake animation
                needleGroup.rotation.z = 0.75 + (Math.random() - 0.5) * 0.45;

                group.scale.set(1.08, 0.94, 1.08);
                setTimeout(() => {
                    if (group) group.scale.set(1.0, 1.0, 1.0);
                }, 75);
            },
            onDestroy: () => {
                this.spawnDebrisExplosion(group.position, 0x81d4fa, 22);
                this.spawnDebrisExplosion(group.position, 0xf59e0b, 16);
                group.visible = false;
            }
        };

        return barracksObj;
    }

    loadPlayerModels() {
        const loader = new GLTFLoader();

        let athleteLoaded = false;
        let enemyLoaded = false;

        const checkReady = () => {
            if (athleteLoaded && enemyLoaded) {
                // Ensure enemy model is scaled at standard factor 0.48
                if (this.redPlayerBaseModel) {
                    this.redPlayerBaseModel.scale.set(0.48, 0.48, 0.48);
                    this.redPlayerBaseModel.updateMatrixWorld(true);
                }

                // Compute bounding box height of enemy model
                const boxEnemy = new THREE.Box3().setFromObject(this.redPlayerBaseModel);
                const enemyHeight = boxEnemy.max.y - boxEnemy.min.y;

                // Scale allied Athlete_05 model so its total height matches enemy model exactly
                if (this.bluePlayerBaseModel) {
                    this.bluePlayerBaseModel.scale.set(1, 1, 1);
                    this.bluePlayerBaseModel.updateMatrixWorld(true);
                    const boxAllied = new THREE.Box3().setFromObject(this.bluePlayerBaseModel);
                    const alliedRawHeight = boxAllied.max.y - boxAllied.min.y;

                    if (enemyHeight > 0.05 && alliedRawHeight > 0.05) {
                        const matchScale = enemyHeight / alliedRawHeight;
                        this.bluePlayerBaseModel.scale.set(matchScale, matchScale, matchScale);
                    } else {
                        this.bluePlayerBaseModel.scale.set(0.48, 0.48, 0.48);
                    }
                }

                this.modelLoaded = true;
                console.log('Player (Athlete_05) and Enemy (Skin_BF14) synchronized to identical size! Height:', enemyHeight);
            }
        };

        const loadGLTF = (url, onSuccess, onError) => {
            fetch(url)
                .then(res => res.arrayBuffer())
                .then(buffer => {
                    loader.parse(buffer, '', onSuccess, (err) => {
                        console.warn('Parse fallback:', err);
                        loader.load(url, onSuccess, undefined, onError);
                    });
                })
                .catch(() => {
                    loader.load(url, onSuccess, undefined, onError);
                });
        };

        // 1. Load Athlete_05.glb for allied player mobs (PRESERVE ORIGINAL COLORS / MATERIALS)
        loadGLTF(
            athleteModelUrl,
            (gltf) => {
                this.bluePlayerBaseModel = gltf.scene;

                // Preserve all original textures, materials and colors
                this.bluePlayerBaseModel.traverse((node) => {
                    if (node.isMesh || node.isSkinnedMesh) {
                        node.castShadow = false;
                        node.receiveShadow = false;
                        if (node.material) {
                            if (Array.isArray(node.material)) {
                                node.material.forEach(m => {
                                    if (node.isSkinnedMesh) m.skinning = true;
                                    m.needsUpdate = true;
                                });
                            } else {
                                if (node.isSkinnedMesh) node.material.skinning = true;
                                node.material.needsUpdate = true;
                            }
                        }
                    }
                });

                athleteLoaded = true;
                checkReady();
            },
            () => {
                console.warn('Failed to load Athlete_05.glb, using fallback');
                this.fallbackHeroBlue();
                athleteLoaded = true;
                checkReady();
            }
        );

        // 2. Load Skin_BF14.glb for enemy mobs (KEEP UNCHANGED with red material)
        loadGLTF(
            skinModelUrl,
            (gltf) => {
                this.redPlayerBaseModel = gltf.scene;
                this.redPlayerBaseModel.scale.set(0.48, 0.48, 0.48);
                this.redPlayerBaseModel.traverse((node) => {
                    if (node.isMesh || node.isSkinnedMesh) {
                        node.castShadow = false;
                        node.receiveShadow = false;
                        node.material = new THREE.MeshStandardMaterial({
                            color: 0xef4444,
                            roughness: 0.3,
                            metalness: 0.1,
                            skinning: !!node.isSkinnedMesh
                        });
                        node.material.needsUpdate = true;
                    }
                });

                enemyLoaded = true;
                checkReady();
            },
            () => {
                console.warn('Failed to load Skin_BF14.glb, using fallback');
                this.fallbackHeroRed();
                enemyLoaded = true;
                checkReady();
            }
        );
    }

    fallbackHeroBlue() {
        this.bluePlayerBaseModel = new THREE.Group();
        const blueMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
        const bHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), blueMat);
        bHead.position.y = 0.8;
        this.bluePlayerBaseModel.add(bHead);
        const bBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.6), blueMat);
        bBody.position.y = 0.4;
        this.bluePlayerBaseModel.add(bBody);
    }

    fallbackHeroRed() {
        this.redPlayerBaseModel = new THREE.Group();
        const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
        const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), redMat);
        rHead.position.y = 0.8;
        this.redPlayerBaseModel.add(rHead);
        const rBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.6), redMat);
        rBody.position.y = 0.4;
        this.redPlayerBaseModel.add(rBody);
    }

    fallbackHero() {
        this.fallbackHeroBlue();
        this.fallbackHeroRed();
        this.modelLoaded = true;
    }

    extractBones(model) {
        const bones = {};
        model.traverse((node) => {
            if (node.isBone) {
                if (node.userData.initRotX === undefined) {
                    node.userData.initRotX = node.rotation.x;
                    node.userData.initRotY = node.rotation.y;
                    node.userData.initRotZ = node.rotation.z;
                    node.userData.initPosY = node.position.y;
                }
                bones[node.name] = node;
                const cleanName = node.name.replace(/[._:\-]/g, '').toLowerCase();
                bones[cleanName] = node;
            }
            if (node.isSkinnedMesh && node.material) {
                if (Array.isArray(node.material)) {
                    node.material.forEach(m => { m.skinning = true; });
                } else {
                    node.material.skinning = true;
                }
            }
        });
        return bones;
    }

    getBoneFromDict(bones, targetName) {
        if (!bones) return null;
        if (bones[targetName]) return bones[targetName];
        const clean = targetName.replace(/[._:\-]/g, '').toLowerCase();
        if (bones[clean]) return bones[clean];

        const synonyms = {
            'thighl': ['leftupleg', 'thighl', 'uplegl', 'legl', 'mixamorigleftupleg', 'thighleft'],
            'thighr': ['rightupleg', 'thighr', 'uplegr', 'legr', 'mixamorigrightupleg', 'thighright'],
            'shinl': ['leftleg', 'shinl', 'lowerlegl', 'mixamorigleftleg', 'shinleft', 'calfleft', 'calfl'],
            'shinr': ['rightleg', 'shinr', 'lowerlegr', 'mixamorigrightleg', 'shinright', 'calfright', 'calfr'],
            'upperarml': ['leftarm', 'upperarml', 'arml', 'mixamorigleftarm', 'armleft', 'upperarmleft'],
            'upperarmr': ['rightarm', 'upperarmr', 'armr', 'mixamorigrightarm', 'armright', 'upperarmright'],
            'forearml': ['leftforearm', 'forearml', 'mixamorigleftforearm', 'forearmleft'],
            'forearmr': ['rightforearm', 'forearmr', 'mixamorigrightforearm', 'forearmright'],
            'spine': ['spine', 'spine1', 'spine2', 'mixamorigspine']
        };

        const list = synonyms[clean] || [];
        for (const alias of list) {
            if (bones[alias]) return bones[alias];
        }

        for (const key in bones) {
            const k = key.toLowerCase();
            if (k.endsWith(clean) || k.includes(clean)) return bones[key];
        }

        return null;
    }

    spawnAlliedMob(x, z, extraData = {}) {
        if (!this.bluePlayerBaseModel) return null;

        if (this.alliedMobs.length >= this.MAX_ALLIED_MOBS) {
            return null;
        }

        let model;
        try {
            model = SkeletonUtils.clone(this.bluePlayerBaseModel);
        } catch (e) {
            model = this.bluePlayerBaseModel.clone(true);
        }

        model.position.set(x, 0, z);
        this.scene.add(model);

        const bones = this.extractBones(model);

        const mob = {
            model: model,
            bones: bones,
            x: x,
            z: z,
            vx: extraData.vx !== undefined ? extraData.vx : 0,
            vz: extraData.vz || this.alliedSpeed,
            inPipe: extraData.inPipe || null,
            pipeT: 0,
            animOffset: Math.random() * 2.0,
            passedGates: new Set(extraData.passedGates || []),
            isAlive: true
        };

        this.alliedMobs.push(mob);
        this.onSquadCountChange(this.alliedMobs.length);
        return mob;
    }

    spawnEnemyMob(x, z) {
        if (!this.redPlayerBaseModel) return null;

        if (this.enemyMobs.length >= this.MAX_ENEMY_MOBS) {
            return null;
        }

        let model;
        try {
            model = SkeletonUtils.clone(this.redPlayerBaseModel);
        } catch (e) {
            model = this.redPlayerBaseModel.clone(true);
        }

        model.position.set(x, 0, z);
        model.rotation.y = Math.PI;
        this.scene.add(model);

        const bones = this.extractBones(model);

        const mob = {
            model: model,
            bones: bones,
            x: x,
            z: z,
            vx: (Math.random() - 0.5) * 0.4,
            vz: this.enemySpeed,
            animOffset: Math.random() * 2.0,
            isAlive: true
        };

        this.enemyMobs.push(mob);
        return mob;
    }

    spawnAlliedMobsSalvo() {
        const count = this.soldiersPerShot;
        const baseZ = this.cannonZ + 1.6;
        const baseX = this.cannonX;

        if (count === 1) {
            this.spawnAlliedMob(baseX, baseZ);
        } else if (count === 2) {
            this.spawnAlliedMob(baseX - 0.28, baseZ);
            this.spawnAlliedMob(baseX + 0.28, baseZ);
        } else if (count === 3) {
            this.spawnAlliedMob(baseX - 0.26, baseZ - 0.05);
            this.spawnAlliedMob(baseX, baseZ + 0.05);
            this.spawnAlliedMob(baseX + 0.26, baseZ - 0.05);
        } else if (count === 4) {
            this.spawnAlliedMob(baseX - 0.85, baseZ - 0.1);
            this.spawnAlliedMob(baseX - 0.22, baseZ + 0.08);
            this.spawnAlliedMob(baseX + 0.22, baseZ + 0.08);
            this.spawnAlliedMob(baseX + 0.85, baseZ - 0.1);
        } else if (count === 5) {
            this.spawnAlliedMob(baseX - 0.95, baseZ - 0.1);
            this.spawnAlliedMob(baseX - 0.38, baseZ + 0.05);
            this.spawnAlliedMob(baseX, baseZ + 0.15);
            this.spawnAlliedMob(baseX + 0.38, baseZ + 0.05);
            this.spawnAlliedMob(baseX + 0.95, baseZ - 0.1);
        } else if (count >= 6) {
            this.spawnAlliedMob(baseX - 1.10, baseZ - 0.12);
            this.spawnAlliedMob(baseX - 0.60, baseZ);
            this.spawnAlliedMob(baseX - 0.20, baseZ + 0.12);
            this.spawnAlliedMob(baseX + 0.20, baseZ + 0.12);
            this.spawnAlliedMob(baseX + 0.60, baseZ);
            this.spawnAlliedMob(baseX + 1.10, baseZ - 0.12);
        }
    }

    setupEventListeners() {
        let isDragging = false;
        let startPointerX = 0;
        let startCannonX = 0;

        const onPointerDown = (e) => {
            if (this.isLevelTransitioning) return;
            isDragging = true;
            this.isPlayerInteracted = true;
            startPointerX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            startCannonX = this.cannonX;
        };

        const onPointerMove = (e) => {
            if (!isDragging || this.isLevelTransitioning) return;
            this.isPlayerInteracted = true;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            const deltaX = (clientX - startPointerX) / (this.width * 0.35);
            this.targetCannonX = THREE.MathUtils.clamp(startCannonX - deltaX * 3.4, this.minCannonX, this.maxCannonX);
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

    triggerGameOver() {
        if (this.isLevelFinished) return;
        this.isLevelFinished = true;
        this.isGameActive = false;

        this.spawnDebrisExplosion(this.cannonGroup.position, 0x0284c7, 18);
        this.cannonGroup.visible = false;

        this.onGameOver();
    }

    update() {
        const delta = Math.min(this.clock.getDelta(), 0.08);
        this.animTime += delta;

        // Level transition driving animation
        if (this.levelTransitionUpdater) {
            this.levelTransitionUpdater(delta);
        }

        // Smooth cannon follow target
        if (!this.isLevelTransitioning) {
            this.cannonX += (this.targetCannonX - this.cannonX) * 16 * delta;
            this.cannonX = THREE.MathUtils.clamp(this.cannonX, this.minCannonX, this.maxCannonX);
            this.cannonGroup.position.x = this.cannonX;

            // Camera framing matching reference
            this.camera.position.set(0, 14.5, this.cannonZ - 14.5);
            this.camera.lookAt(0, 1.2, this.cannonZ + 12.0);
        }

        // Ease scale back to 1.0 after upgrade
        this.cannonGroup.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 8);

        // If Jet / Spaceship, hover bobbing & banking tilt
        if (this.currentCannonTier >= 3) {
            this.cannonGroup.position.y = 0.25 + Math.sin(this.animTime * 5.0) * 0.10;
            const bankTilt = (this.targetCannonX - this.cannonX) * 0.35;
            this.cannonGroup.rotation.z = bankTilt;
        } else {
            this.cannonGroup.position.y = 0;
            this.cannonGroup.rotation.z = 0;
        }

        // Wheel turn rotation
        const wheelTurn = (this.targetCannonX - this.cannonX) * 18 * delta;
        this.wheels.forEach(w => {
            w.rotation.x += wheelTurn;
        });

        // Recoil animation
        if (this.recoilAnim > 0) {
            this.recoilAnim -= delta * 14;
            const kickback = Math.max(0, this.recoilAnim) * 0.18;
            this.cannonBarrels.forEach(b => {
                b.position.z = (b.userData.initPosZ || 0.68) - kickback;
            });
        }

        // Muzzle flashes
        if (this.muzzleFlashTimer > 0) {
            this.muzzleFlashTimer -= delta;
            const op = Math.max(0, this.muzzleFlashTimer * 10);
            this.muzzleFlashes.forEach(f => {
                f.material.opacity = op;
            });
        }

        // Update Moving Gates (only when active/unlocked in Level 2)
        this.gates.forEach(g => {
            if (g.data && g.data.moving && !g.isLocked && g.level === this.currentLevel) {
                const moveX = (g.data.baseX || 0) + Math.sin(this.animTime * (g.data.moveSpeed || 1.6)) * (g.data.moveRange || 2.2);
                g.x = THREE.MathUtils.clamp(moveX, -2.6, 2.6);
                g.group.position.x = g.x;
            }
        });

        if (this.isGameActive && !this.isLevelFinished && !this.isLevelTransitioning) {
            if (this.isPlayerInteracted) {
                this.shootTimer += delta;
                if (this.shootTimer >= this.shootInterval && this.modelLoaded) {
                    this.shootTimer = 0;
                    this.recoilAnim = 1.0;
                    this.muzzleFlashTimer = 0.08;
                    this.spawnAlliedMobsSalvo();
                }
            }

            // Enemy mobs spawn from active barracks only
            this.enemyBarracks.forEach(barracks => {
                if (barracks.isDestroyed || barracks.isLocked || barracks.level !== this.currentLevel) return;
                barracks.spawnTimer += delta;
                if (barracks.spawnTimer >= barracks.spawnInterval && this.modelLoaded) {
                    barracks.spawnTimer = 0;
                    this.spawnEnemyMob(barracks.x + (Math.random() - 0.5) * 0.8, barracks.z - 1.2);
                }
            });

            this.updateAlliedMobs(delta);
            this.updateEnemyMobs(delta);

            this.handleCombatAndInteractions();

            // Check Level completion
            const currentLevelBarracks = this.enemyBarracks.filter(b => b.level === this.currentLevel);
            const allDestroyed = currentLevelBarracks.length > 0 && currentLevelBarracks.every(b => b.isDestroyed);
            if (allDestroyed) {
                if (this.currentLevel === 1) {
                    this.advanceToNextLevel();
                } else if (!this.isLevelFinished) {
                    this.isLevelFinished = true;
                    this.onLevelComplete();
                }
            }
        }

        this.updateDebrisAndParticles(delta);
        this.renderer.render(this.scene, this.camera);
    }

    animateMobBones(mob, isEnemy = false) {
        const b = mob.bones;
        if (!b) return;

        const freq = isEnemy ? 5.8 : 6.6;
        const legSwing = Math.sin((this.animTime + mob.animOffset) * freq);

        const thighL = this.getBoneFromDict(b, 'thighL');
        const thighR = this.getBoneFromDict(b, 'thighR');
        const shinL = this.getBoneFromDict(b, 'shinL');
        const shinR = this.getBoneFromDict(b, 'shinR');
        const armL = this.getBoneFromDict(b, 'upper_armL');
        const armR = this.getBoneFromDict(b, 'upper_armR');
        const farmL = this.getBoneFromDict(b, 'forearmL');
        const farmR = this.getBoneFromDict(b, 'forearmR');
        const spine = this.getBoneFromDict(b, 'spine');

        if (thighL) thighL.rotation.x = thighL.userData.initRotX + legSwing * 0.85;
        if (thighR) thighR.rotation.x = thighR.userData.initRotX - legSwing * 0.85;

        if (shinL) shinL.rotation.x = shinL.userData.initRotX + Math.max(0, -legSwing) * 1.05;
        if (shinR) shinR.rotation.x = shinR.userData.initRotX + Math.max(0, legSwing) * 1.05;

        if (armL) armL.rotation.x = armL.userData.initRotX - legSwing * 0.75;
        if (armR) armR.rotation.x = armR.userData.initRotX + legSwing * 0.75;

        if (farmL) farmL.rotation.x = farmL.userData.initRotX + 0.5;
        if (farmR) farmR.rotation.x = farmR.userData.initRotX + 0.5;

        if (spine) spine.position.y = (spine.userData.initPosY || 0) - 0.02 + Math.abs(legSwing) * 0.05;
    }

    updateAlliedMobs(delta) {
        for (let i = this.alliedMobs.length - 1; i >= 0; i--) {
            const mob = this.alliedMobs[i];
            if (!mob.isAlive) {
                this.scene.remove(mob.model);
                this.alliedMobs.splice(i, 1);
                continue;
            }

            let targetX = mob.x;
            let hasTarget = false;

            // Seek nearest active Enemy
            let closestEnemyDist = 999;
            let enemyTargetX = 0;
            for (let e = 0; e < this.enemyMobs.length; e++) {
                const enemy = this.enemyMobs[e];
                if (enemy.isAlive && enemy.z > mob.z && (enemy.z - mob.z) < 4.0) {
                    const dist = enemy.z - mob.z;
                    if (dist < closestEnemyDist) {
                        closestEnemyDist = dist;
                        enemyTargetX = enemy.x;
                        hasTarget = true;
                    }
                }
            }

            if (hasTarget) {
                targetX = enemyTargetX;
            } else {
                // Seek nearest active barracks of current level
                let closestBarracksDist = 999;
                let barracksTargetX = 0;
                for (let b = 0; b < this.enemyBarracks.length; b++) {
                    const barracks = this.enemyBarracks[b];
                    if (!barracks.isDestroyed && !barracks.isLocked && barracks.level === this.currentLevel && barracks.z > mob.z && (barracks.z - mob.z) < 10.0) {
                        const dist = barracks.z - mob.z;
                        if (dist < closestBarracksDist) {
                            closestBarracksDist = dist;
                            barracksTargetX = barracks.x;
                            hasTarget = true;
                        }
                    }
                }
                if (hasTarget) {
                    targetX = barracksTargetX;
                }
            }

            if (hasTarget) {
                const diffX = targetX - mob.x;
                mob.vx += THREE.MathUtils.clamp(diffX * 3.5 - mob.vx, -4.5, 4.5) * delta;
            } else {
                mob.vx *= (1 - delta * 4.0);
            }

            mob.z += mob.vz * delta;
            mob.x += mob.vx * delta;
            mob.x = THREE.MathUtils.clamp(mob.x, -3.4, 3.4);

            const hop = Math.abs(Math.sin((this.animTime + mob.animOffset) * 6.6)) * 0.08;
            mob.model.position.set(mob.x, hop, mob.z);

            const headingAngle = Math.atan2(mob.vx, mob.vz);
            mob.model.rotation.y = Math.PI + headingAngle * 0.75;
            mob.model.rotation.x = 0.12;
            mob.model.rotation.z = Math.sin((this.animTime + mob.animOffset) * 6.6) * 0.05;

            this.animateMobBones(mob, false);

            // Despawn limits
            if (this.currentLevel === 1 && mob.z > 22.0) {
                mob.isAlive = false;
            } else if (this.currentLevel === 2 && mob.z > 65.0) {
                mob.isAlive = false;
            }
        }
    }

    updateEnemyMobs(delta) {
        for (let i = this.enemyMobs.length - 1; i >= 0; i--) {
            const mob = this.enemyMobs[i];
            if (!mob.isAlive) {
                this.scene.remove(mob.model);
                this.enemyMobs.splice(i, 1);
                continue;
            }

            mob.z += mob.vz * delta;
            mob.x = THREE.MathUtils.clamp(mob.x, -3.4, 3.4);

            const hop = Math.abs(Math.sin((this.animTime + mob.animOffset) * 5.8)) * 0.08;
            mob.model.position.set(mob.x, hop, mob.z);

            mob.model.rotation.y = Math.PI;
            mob.model.rotation.x = -0.12;
            mob.model.rotation.z = Math.sin((this.animTime + mob.animOffset) * 5.8) * 0.05;

            this.animateMobBones(mob, true);

            // Defeat condition: Enemy breaches the current level's cannon baseline
            if (mob.z <= this.levelBaselineZ) {
                this.triggerGameOver();
                return;
            }
        }
    }

    handleCombatAndInteractions() {
        // 1. ALLIED MOBS vs GATES
        this.gates.forEach(g => {
            if (g.isLocked || g.level !== this.currentLevel) return;

            this.alliedMobs.forEach(mob => {
                if (!mob.isAlive) return;
                if (mob.passedGates.has(g.id)) return;

                const dz = mob.z - g.z;
                const dx = mob.x - g.x;

                if (Math.abs(dz) < 0.7 && Math.abs(dx) < g.width / 2) {
                    mob.passedGates.add(g.id);
                    g.onPass();

                    if (g.data.type === 'div') {
                        if (Math.random() < 0.5) {
                            mob.isAlive = false;
                            this.spawnSparkBurst(mob.x, 0.6, mob.z, 0xef4444);
                        }
                    } else if (g.data.type === 'sub') {
                        mob.isAlive = false;
                        this.spawnSparkBurst(mob.x, 0.6, mob.z, 0xef4444);
                    } else {
                        let countToAdd = 0;
                        if (g.data.type === 'mult') {
                            countToAdd = Math.min(16, g.data.val * 2 - 1);
                        } else {
                            countToAdd = Math.min(10, g.data.val);
                        }

                        for (let k = 0; k < countToAdd; k++) {
                            this.spawnAlliedMob(
                                mob.x + (Math.random() - 0.5) * 1.4,
                                mob.z - 0.2 - (k % 4) * 0.22,
                                {
                                    vx: (Math.random() - 0.5) * 0.4,
                                    passedGates: Array.from(mob.passedGates)
                                }
                            );
                        }
                    }
                }
            });
        });

        // 2. ALLIED MOBS vs YELLOW HP BLOCKS (Pedestals)
        this.yellowBlocks.forEach(block => {
            if (block.isDestroyed || block.isLocked || block.level !== this.currentLevel) return;

            this.alliedMobs.forEach(mob => {
                if (!mob.isAlive) return;
                const dz = mob.z - block.z;
                const dx = mob.x - block.x;

                if (Math.abs(dz) < block.depth / 2 + 0.35 && Math.abs(dx) < block.width / 2 + 0.25) {
                    mob.isAlive = false;
                    block.hp -= 1;
                    block.onHit(1);
                    this.spawnSparkBurst(mob.x, 0.6, mob.z, 0xfacc15);

                    if (block.hp <= 0 && !block.isDestroyed) {
                        block.isDestroyed = true;
                        block.onDestroy();
                        this.setPlayerCannonTier(block.tier);
                        this.onCoinCollect({ amount: block.tier * 250 });
                    }
                }
            });
        });

        // 3. ALLIED MOBS vs ENEMY MOBS (1-to-1 annihilation)
        this.alliedMobs.forEach(allied => {
            if (!allied.isAlive) return;
            this.enemyMobs.forEach(enemy => {
                if (!enemy.isAlive) return;
                const distSq = (allied.x - enemy.x) ** 2 + (allied.z - enemy.z) ** 2;
                if (distSq < 0.65) {
                    allied.isAlive = false;
                    enemy.isAlive = false;
                    this.spawnSparkBurst((allied.x + enemy.x) / 2, 0.6, (allied.z + enemy.z) / 2, 0xffffff);
                }
            });
        });

        // 4. ALLIED MOBS vs ENEMY BARRACKS
        this.enemyBarracks.forEach(barracks => {
            if (barracks.isDestroyed || barracks.isLocked || barracks.level !== this.currentLevel) return;

            this.alliedMobs.forEach(mob => {
                if (!mob.isAlive) return;
                const dz = mob.z - barracks.z;
                const dx = mob.x - barracks.x;

                if (Math.abs(dz) < barracks.depth / 2 + 0.4 && Math.abs(dx) < barracks.width / 2 + 0.3) {
                    mob.isAlive = false;
                    barracks.hp -= 1;
                    barracks.onHit(1);
                    this.spawnSparkBurst(mob.x, 0.8, mob.z, 0xef4444);

                    if (barracks.hp <= 0 && !barracks.isDestroyed) {
                        barracks.isDestroyed = true;
                        barracks.onDestroy();
                        this.onCoinCollect({ amount: 500 });
                    }
                }
            });
        });
    }

    spawnSparkBurst(x, y, z, hexColor) {
        for (let i = 0; i < 4; i++) {
            const geo = new THREE.SphereGeometry(0.08, 6, 6);
            const mat = new THREE.MeshBasicMaterial({ color: hexColor });
            const p = new THREE.Mesh(geo, mat);
            p.position.set(x, y, z);
            p.userData = {
                vx: (Math.random() - 0.5) * 3,
                vy: 2 + Math.random() * 2,
                vz: (Math.random() - 0.5) * 3,
                life: 0.25
            };
            this.scene.add(p);
            this.particlesList.push(p);
        }
    }

    spawnDebrisExplosion(pos, hexColor, count = 14) {
        const mat = new THREE.MeshStandardMaterial({ color: hexColor, roughness: 0.5 });
        for (let i = 0; i < count; i++) {
            const size = 0.25 + Math.random() * 0.25;
            const geo = new THREE.BoxGeometry(size, size, size);
            const debris = new THREE.Mesh(geo, mat);
            debris.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.0, (Math.random() - 0.5) * 1.5));
            debris.userData = {
                vx: (Math.random() - 0.5) * 6,
                vy: 3 + Math.random() * 5,
                vz: (Math.random() - 0.5) * 6,
                rotX: Math.random() * 8,
                rotY: Math.random() * 8,
                life: 0.9
            };
            this.scene.add(debris);
            this.debrisList.push(debris);
        }
    }

    updateDebrisAndParticles(delta) {
        for (let i = this.particlesList.length - 1; i >= 0; i--) {
            const p = this.particlesList[i];
            const u = p.userData;
            u.life -= delta;
            if (u.life <= 0) {
                this.scene.remove(p);
                this.particlesList.splice(i, 1);
            } else {
                p.position.x += u.vx * delta;
                p.position.y += u.vy * delta;
                p.position.z += u.vz * delta;
                u.vy -= 9.8 * delta;
            }
        }

        for (let i = this.debrisList.length - 1; i >= 0; i--) {
            const d = this.debrisList[i];
            const u = d.userData;
            u.life -= delta;
            if (u.life <= 0) {
                this.scene.remove(d);
                this.debrisList.splice(i, 1);
            } else {
                d.position.x += u.vx * delta;
                d.position.y += u.vy * delta;
                d.position.z += u.vz * delta;
                d.rotation.x += u.rotX * delta;
                d.rotation.y += u.rotY * delta;
                u.vy -= 14 * delta;
            }
        }
    }

    roundRect(ctx, x, y, width, height, radius, fill, stroke) {
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
