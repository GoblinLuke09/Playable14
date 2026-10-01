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
        this.scene.background = new THREE.Color(0xa7d898);
        this.scene.fog = new THREE.Fog(0xa7d898, 65, 150);

        this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 350);
        this.camera.position.set(0, 22, -18);
        this.camera.lookAt(0, 0, 16);

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
        this.renderer.domElement.style.zIndex = '1';
        this.container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x88bb66, 0.55);
        this.scene.add(hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.4);
        this.dirLight.position.set(-14, 35, -10);
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
        const groundGeo = new THREE.PlaneGeometry(160, 300);
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#a1d893';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#94ce85';
        for (let i = 0; i < 256; i += 32) {
            ctx.fillRect(0, i, 256, 16);
        }
        const grassTex = new THREE.CanvasTexture(canvas);
        grassTex.wrapS = THREE.RepeatWrapping;
        grassTex.wrapT = THREE.RepeatWrapping;
        grassTex.repeat.set(16, 30);

        const groundMat = new THREE.MeshLambertMaterial({ map: grassTex });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.08, 70);
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createTrack() {
        this.trackGroup = new THREE.Group();
        const roadLength = 180;

        const roadMat = new THREE.MeshStandardMaterial({
            color: 0xb5bcc7,
            roughness: 0.85,
            metalness: 0.05
        });
        const roadGeo = new THREE.BoxGeometry(7.6, 0.6, roadLength);
        const roadMesh = new THREE.Mesh(roadGeo, roadMat);
        roadMesh.position.set(0, -0.3, roadLength / 2 - 10);
        roadMesh.receiveShadow = true;
        this.trackGroup.add(roadMesh);

        // Level 1 Starting Baseline at Z = 0
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const lineGeo = new THREE.PlaneGeometry(7.2, 0.25);
        const lineMesh = new THREE.Mesh(lineGeo, lineMat);
        lineMesh.rotation.x = -Math.PI / 2;
        lineMesh.position.set(0, 0.02, 0.0);
        this.trackGroup.add(lineMesh);

        // Level 2 Starting Baseline at Z = 24.0
        const line2Mesh = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
        line2Mesh.rotation.x = -Math.PI / 2;
        line2Mesh.position.set(0, 0.02, 24.0);
        this.trackGroup.add(line2Mesh);

        const curbMat = new THREE.MeshLambertMaterial({ color: 0x8a93a0 });
        [-3.85, 3.85].forEach(cx => {
            const curbGeo = new THREE.BoxGeometry(0.2, 0.7, roadLength);
            const curbMesh = new THREE.Mesh(curbGeo, curbMat);
            curbMesh.position.set(cx, -0.25, roadLength / 2 - 10);
            curbMesh.castShadow = true;
            this.trackGroup.add(curbMesh);
        });

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
            this.camera.position.set(0, 22, this.cannonZ - 16.0);
            this.camera.lookAt(0, 0, this.cannonZ + 18.0);

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
        this.camera.position.set(0, 22, this.cannonZ - 16.0);
        this.camera.lookAt(0, 0, this.cannonZ + 18.0);

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
        group.position.set(config.x, config.height / 2, config.z);

        const isLocked = (config.level || 1) > 1;

        const blockMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            roughness: 0.25,
            metalness: 0.25
        });
        const blockGeo = new THREE.BoxGeometry(config.width, config.height, config.depth);
        const blockMesh = new THREE.Mesh(blockGeo, blockMat);
        blockMesh.castShadow = true;
        blockMesh.receiveShadow = true;
        group.add(blockMesh);

        const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff066, side: THREE.DoubleSide });
        const topRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.75, 16), ringMat);
        topRing.rotation.x = -Math.PI / 2;
        topRing.position.y = config.height / 2 + 0.01;
        group.add(topRing);

        const showcaseData = this.buildCannonModel(config.tier, true);
        const showcaseMesh = showcaseData.mesh;
        showcaseMesh.position.set(0, config.height / 2 + 0.02, 0);
        group.add(showcaseMesh);

        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');

        const updateLabel = (hp) => {
            ctx.clearRect(0, 0, 320, 200);
            ctx.font = '900 120px "Arial Black", Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 20;
            ctx.strokeStyle = '#0f172a';
            ctx.lineJoin = 'round';
            ctx.strokeText(`${Math.max(0, Math.ceil(hp))}`, 160, 100);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${Math.max(0, Math.ceil(hp))}`, 160, 100);
        };
        updateLabel(config.hp);

        const labelTex = new THREE.CanvasTexture(canvas);
        const labelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(config.width * 0.88, config.height * 0.75),
            new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, side: THREE.FrontSide })
        );
        labelMesh.position.set(0, 0, -config.depth / 2 - 0.02);
        labelMesh.rotation.set(0, Math.PI, 0);
        group.add(labelMesh);

        this.scene.add(group);

        const blockObj = {
            id: config.id,
            level: config.level || 1,
            isLocked: isLocked,
            tier: config.tier,
            group: group,
            blockMesh: blockMesh,
            showcaseMesh: showcaseMesh,
            x: config.x,
            z: config.z,
            width: config.width,
            height: config.height,
            depth: config.depth,
            hp: config.hp,
            maxHp: config.hp,
            isDestroyed: false,
            onHit: () => {
                updateLabel(blockObj.hp);
                labelTex.needsUpdate = true;

                group.scale.set(1.08, 0.94, 1.08);
                setTimeout(() => {
                    if (group) group.scale.set(1.0, 1.0, 1.0);
                }, 70);
            },
            onDestroy: () => {
                this.spawnDebrisExplosion(group.position, 0xfacc15, 20);
                group.visible = false;
            }
        };

        return blockObj;
    }

    createEnemyBarracks(config) {
        const group = new THREE.Group();
        group.position.set(config.x, 0, config.z);

        const isLocked = (config.level || 1) > 1;

        const redMainMat = new THREE.MeshStandardMaterial({ color: 0xff4136, roughness: 0.35, metalness: 0.1 });
        const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x3d0c0c, roughness: 0.6 });
        const doorInnerMat = new THREE.MeshStandardMaterial({ color: 0x8a3324, roughness: 0.5 });
        const woodPoleMat = new THREE.MeshStandardMaterial({ color: 0x8d5b4c, roughness: 0.7 });
        const brightRedFlagMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide });

        const bW = config.width || 2.5;
        const bH = config.height || 3.2;
        const bD = config.depth || 2.2;

        const baseRim = new THREE.Mesh(new THREE.BoxGeometry(bW * 1.04, 0.28, bD * 1.04), darkTrimMat);
        baseRim.position.y = 0.14;
        baseRim.castShadow = true;
        group.add(baseRim);

        const mainBody = new THREE.Mesh(new THREE.BoxGeometry(bW, bH * 0.95, bD), redMainMat);
        mainBody.position.y = (bH * 0.95) / 2 + 0.14;
        mainBody.castShadow = true;
        mainBody.receiveShadow = true;
        group.add(mainBody);

        const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(bW * 1.05, 0.22, bD * 1.05), darkTrimMat);
        roofTrim.position.y = bH * 0.95 + 0.14 + 0.11;
        roofTrim.castShadow = true;
        group.add(roofTrim);

        [-bW / 2 - 0.02, bW / 2 + 0.02].forEach(px => {
            const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.12, bH * 0.95, bD * 0.8), darkTrimMat);
            sideTrim.position.set(px, (bH * 0.95) / 2 + 0.14, 0);
            group.add(sideTrim);
        });

        const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.90, 0.15), darkTrimMat);
        doorFrame.position.set(0, 0.58, -bD / 2 - 0.06);
        group.add(doorFrame);

        const doorInner = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.76), doorInnerMat);
        doorInner.position.set(0, 0.50, -bD / 2 - 0.14);
        doorInner.rotation.y = Math.PI;
        group.add(doorInner);

        const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.22, 0.28), darkTrimMat);
        canopy.position.set(0, 0.98, -bD / 2 - 0.12);
        group.add(canopy);

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4), woodPoleMat);
        pole.position.set(0, bH + 0.65, 0);
        group.add(pole);

        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), brightRedFlagMat);
        flag.position.set(0.38, bH + 1.05, 0);
        group.add(flag);

        const canvas = document.createElement('canvas');
        canvas.width = 380;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');

        const updateHpLabel = (hp) => {
            ctx.clearRect(0, 0, 380, 200);
            ctx.fillStyle = '#8b2e2b';
            this.roundRect(ctx, 8, 8, 364, 184, 18, true, false);

            ctx.lineWidth = 14;
            ctx.strokeStyle = '#2b0909';
            this.roundRect(ctx, 8, 8, 364, 184, 18, false, true);

            ctx.font = '900 115px "Arial Black", Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 24;
            ctx.strokeStyle = '#0f172a';
            ctx.lineJoin = 'round';
            ctx.strokeText(`${Math.max(0, Math.ceil(hp))}`, 190, 100);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${Math.max(0, Math.ceil(hp))}`, 190, 100);
        };
        updateHpLabel(config.hp);

        const hpTex = new THREE.CanvasTexture(canvas);
        hpTex.needsUpdate = true;

        const hpScreen = new THREE.Mesh(
            new THREE.PlaneGeometry(bW * 0.88, 0.90),
            new THREE.MeshBasicMaterial({ map: hpTex, transparent: true, side: THREE.FrontSide })
        );
        hpScreen.position.set(0, bH * 0.65 + 0.15, -bD / 2 - 0.05);
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
            width: config.width,
            depth: config.depth,
            hp: config.hp,
            maxHp: config.maxHp,
            spawnInterval: config.spawnInterval,
            spawnTimer: 0,
            isDestroyed: false,
            onHit: () => {
                updateHpLabel(barracksObj.hp);
                hpTex.needsUpdate = true;

                group.scale.set(1.1, 0.92, 1.1);
                setTimeout(() => {
                    if (group) group.scale.set(1.0, 1.0, 1.0);
                }, 80);
            },
            onDestroy: () => {
                this.spawnDebrisExplosion(group.position, 0xdc2626, 22);
                group.visible = false;
            }
        };

        return barracksObj;
    }

    loadPlayerModels() {
        const loader = new GLTFLoader();

        const setupModels = (gltf) => {
            this.bluePlayerBaseModel = gltf.scene;
            this.bluePlayerBaseModel.scale.set(0.48, 0.48, 0.48);

            this.bluePlayerBaseModel.traverse((node) => {
                if (node.isMesh || node.isSkinnedMesh) {
                    node.castShadow = false;
                    node.receiveShadow = false;
                    node.material = new THREE.MeshStandardMaterial({
                        color: 0x0ea5e9,
                        roughness: 0.3,
                        metalness: 0.1,
                        skinning: true
                    });
                    node.material.needsUpdate = true;
                }
            });

            this.redPlayerBaseModel = SkeletonUtils.clone(gltf.scene);
            this.redPlayerBaseModel.scale.set(0.48, 0.48, 0.48);
            this.redPlayerBaseModel.traverse((node) => {
                if (node.isMesh || node.isSkinnedMesh) {
                    node.castShadow = false;
                    node.receiveShadow = false;
                    node.material = new THREE.MeshStandardMaterial({
                        color: 0xef4444,
                        roughness: 0.3,
                        metalness: 0.1,
                        skinning: true
                    });
                    node.material.needsUpdate = true;
                }
            });

            this.modelLoaded = true;
            console.log('Skin_BF14 models loaded successfully!');
        };

        fetch(skinModelUrl)
            .then(res => res.arrayBuffer())
            .then(buffer => {
                loader.parse(buffer, '', setupModels, (err) => {
                    console.warn('Parse fallback:', err);
                    loader.load(skinModelUrl, setupModels, undefined, () => this.fallbackHero());
                });
            })
            .catch(() => {
                loader.load(skinModelUrl, setupModels, undefined, () => this.fallbackHero());
            });
    }

    fallbackHero() {
        this.bluePlayerBaseModel = new THREE.Group();
        const blueMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
        const bHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), blueMat);
        bHead.position.y = 0.8;
        this.bluePlayerBaseModel.add(bHead);
        const bBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.6), blueMat);
        bBody.position.y = 0.4;
        this.bluePlayerBaseModel.add(bBody);

        this.redPlayerBaseModel = new THREE.Group();
        const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
        const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), redMat);
        rHead.position.y = 0.8;
        this.redPlayerBaseModel.add(rHead);
        const rBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.6), redMat);
        rBody.position.y = 0.4;
        this.redPlayerBaseModel.add(rBody);

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
                }
                bones[node.name] = node;
                const cleanName = node.name.replace(/[._]/g, '').toLowerCase();
                bones[cleanName] = node;
            }
            if (node.isSkinnedMesh && node.material) {
                node.material.skinning = true;
            }
        });
        return bones;
    }

    getBoneFromDict(bones, targetName) {
        if (!bones) return null;
        if (bones[targetName]) return bones[targetName];
        const clean = targetName.replace(/[._]/g, '').toLowerCase();
        if (bones[clean]) return bones[clean];
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
            mob.model.rotation.y = headingAngle * 0.75;
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
                    block.hp -= 2;
                    block.onHit(2);
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
