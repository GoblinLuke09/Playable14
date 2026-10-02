import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import alliedModelUrl from './assets/Model/Athlete_05.glb';
import enemyModelUrl from './assets/Model/Skin_BF14.glb';

export class Game3D {
    constructor(container, options = {}) {
        this.container = container;
        this.onHit = options.onHit || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onSquadCountChange = options.onSquadCountChange || (() => {});
        this.onLevelComplete = options.onLevelComplete || (() => {});
        this.onGameOver = options.onGameOver || (() => {});
        this.onCoinCollect = options.onCoinCollect || (() => {});
        this.onLevel2Arrived = options.onLevel2Arrived || (() => {});

        this.width = container.clientWidth || window.innerWidth;
        this.height = container.clientHeight || window.innerHeight;

        this.isGameActive = true;
        this.isLevelFinished = false;
        this.isPlayerInteracted = false;

        // Level management
        this.currentLevel = 1;
        this.isTransitioning = false;
        this.levelBaselineZ = 0.0;
        this.cameraZOffset = -18;
        this.cameraYOffset = 22;
        this.targetCameraLookZ = 16;

        // Player Cannon Position & Controls
        this.cannonX = 0;
        this.targetCannonX = 0;
        this.minCannonX = -2.8;
        this.maxCannonX = 2.8;
        this.cannonZ = -2.0;

        // Firing rate - fast steady stream
        this.shootTimer = 0;
        this.shootInterval = 0.16; // ~6.2 shots/sec
        this.recoilAnim = 0;
        this.muzzleFlashTimer = 0;

        // Speeds: Relaxed, slow pace
        this.alliedSpeed = 4.4;
        this.enemySpeed = -2.2;

        // Massive Swarm Limit
        this.MAX_ALLIED_MOBS = 160;
        this.MAX_ENEMY_MOBS = 45;

        // Models
        this.bluePlayerBaseModel = null;
        this.redPlayerBaseModel = null;
        this.modelLoaded = false;

        // Troops Lists
        this.alliedMobs = [];
        this.enemyMobs = [];

        // Warp Pipes (Single Pipe 1)
        this.warpPipes = [];

        // Obstacles & Gates & Barracks
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
        this.createCannon();
        this.createLevelCourse();
        this.loadPlayerModels();
        this.setupEventListeners();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xa7d898);
        this.scene.fog = new THREE.Fog(0xa7d898, 50, 110);

        this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 250);
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
        this.dirLight.position.set(-14, 32, -10);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 90;
        this.dirLight.shadow.camera.left = -16;
        this.dirLight.shadow.camera.right = 16;
        this.dirLight.shadow.camera.top = 40;
        this.dirLight.shadow.camera.bottom = -15;
        this.dirLight.shadow.bias = -0.0004;
        this.scene.add(this.dirLight);
    }

    createEnvironment() {
        const groundGeo = new THREE.PlaneGeometry(120, 260);
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
        grassTex.repeat.set(12, 26);

        const groundMat = new THREE.MeshLambertMaterial({ map: grassTex });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.08, 55);
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createTrack() {
        this.trackGroup = new THREE.Group();
        const roadLength = 155;

        const roadMat = new THREE.MeshStandardMaterial({
            color: 0xb5bcc7,
            roughness: 0.85,
            metalness: 0.05
        });
        const roadGeo = new THREE.BoxGeometry(7.6, 0.6, roadLength);
        const roadMesh = new THREE.Mesh(roadGeo, roadMat);
        roadMesh.position.set(0, -0.3, roadLength / 2 - 8);
        roadMesh.receiveShadow = true;
        this.trackGroup.add(roadMesh);

        // White Guideline Baseline for Level 1 at Z = 0
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const lineGeo = new THREE.PlaneGeometry(7.2, 0.22);
        const lineMesh = new THREE.Mesh(lineGeo, lineMat);
        lineMesh.rotation.x = -Math.PI / 2;
        lineMesh.position.set(0, 0.02, 0.0);
        this.trackGroup.add(lineMesh);

        // White Guideline Baseline for Level 2 at Z = 50.0
        const line2Geo = new THREE.PlaneGeometry(7.2, 0.22);
        const line2Mesh = new THREE.Mesh(line2Geo, lineMat);
        line2Mesh.rotation.x = -Math.PI / 2;
        line2Mesh.position.set(0, 0.02, 50.0);
        this.trackGroup.add(line2Mesh);

        const curbMat = new THREE.MeshLambertMaterial({ color: 0x8a93a0 });
        [-3.85, 3.85].forEach(cx => {
            const curbGeo = new THREE.BoxGeometry(0.2, 0.7, roadLength);
            const curbMesh = new THREE.Mesh(curbGeo, curbMat);
            curbMesh.position.set(cx, -0.25, roadLength / 2 - 8);
            curbMesh.castShadow = true;
            this.trackGroup.add(curbMesh);
        });

        this.scene.add(this.trackGroup);
    }

    createCannon() {
        this.cannonGroup = new THREE.Group();
        this.cannonGroup.position.set(this.cannonX, 0, this.cannonZ);

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.25, metalness: 0.2 });
        const cyanBrightMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.3 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.3 });
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
        const hubMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2 });
        const glowYellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xeab308, emissiveIntensity: 0.7 });

        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 1.6), bodyMat);
        chassis.position.y = 0.45;
        chassis.castShadow = true;
        this.cannonGroup.add(chassis);

        const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.15, 1.3), cyanBrightMat);
        topPlate.position.y = 0.72;
        this.cannonGroup.add(topPlate);

        this.cannonTurret = new THREE.Group();
        this.cannonTurret.position.set(0, 0.75, 0.1);

        const sphereBase = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 20), cyanBrightMat);
        sphereBase.castShadow = true;
        this.cannonTurret.add(sphereBase);

        const barrelGeo = new THREE.CylinderGeometry(0.38, 0.45, 1.4, 20);
        this.cannonBarrel = new THREE.Mesh(barrelGeo, cyanBrightMat);
        this.cannonBarrel.rotation.x = Math.PI / 2;
        this.cannonBarrel.position.set(0, 0.12, 0.75);
        this.cannonBarrel.castShadow = true;
        this.cannonTurret.add(this.cannonBarrel);

        const muzzleTip = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.08, 12, 20), darkMat);
        muzzleTip.position.set(0, 0.12, 1.45);
        this.cannonTurret.add(muzzleTip);

        const flashMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0 });
        this.muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), flashMat);
        this.muzzleFlash.position.set(0, 0.12, 1.6);
        this.cannonTurret.add(this.muzzleFlash);

        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6), darkMat);
        antenna.position.set(0.25, 0.75, -0.25);
        this.cannonTurret.add(antenna);

        const antennaBall = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), glowYellowMat);
        antennaBall.position.set(0.25, 1.05, -0.25);
        this.cannonTurret.add(antennaBall);

        this.cannonGroup.add(this.cannonTurret);

        const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 16);
        wheelGeo.rotateZ(Math.PI / 2);
        const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.30, 12);
        hubGeo.rotateZ(Math.PI / 2);

        const wheelPositions = [
            [-0.92, 0.32, 0.55],
            [0.92, 0.32, 0.55],
            [-0.92, 0.32, -0.55],
            [0.92, 0.32, -0.55]
        ];

        this.wheels = [];
        wheelPositions.forEach(pos => {
            const wGroup = new THREE.Group();
            wGroup.position.set(pos[0], pos[1], pos[2]);

            const tire = new THREE.Mesh(wheelGeo, wheelMat);
            tire.castShadow = true;
            wGroup.add(tire);

            const hub = new THREE.Mesh(hubGeo, hubMat);
            wGroup.add(hub);

            this.cannonGroup.add(wGroup);
            this.wheels.push(wGroup);
        });

        this.scene.add(this.cannonGroup);
    }

    // -----------------------------------------------------------------
    // LEVEL ENVIRONMENT & MULTIPLIERS (LEVEL 1 & LEVEL 2)
    // -----------------------------------------------------------------
    createLevelCourse() {
        // ================= LEVEL 1 (Z: 0 -> 45) =================
        // 1. GATE 1 (Left: x2) at Z = 13.5
        const gate1 = this.createMultiplierGate('gate_1', -2.0, 13.5, 2.8, { type: 'mult', val: 2, label: 'x2' });
        gate1.level = 1;
        this.gates.push(gate1);

        // 2. YELLOW HP BLOCK 1 (Right: HP 180) at Z = 14.0 + Gate x3 beneath it
        const yellowBlock1 = this.createYellowHpBlock({
            x: 1.8,
            z: 14.0,
            width: 2.8,
            height: 1.4,
            depth: 1.2,
            hp: 180,
            id: 'block_274'
        });
        yellowBlock1.level = 1;
        this.yellowBlocks.push(yellowBlock1);

        const gate2 = this.createMultiplierGate('gate_2', 1.8, 15.5, 2.2, { type: 'mult', val: 3, label: 'x3' });
        gate2.level = 1;
        this.gates.push(gate2);

        // 3. WARP PIPE 1 (Green curved pipe linking Middle to Gate x3)
        const pipe1 = this.createWarpPipe({
            points: [
                new THREE.Vector3(-0.35, 0.55, 12.8),
                new THREE.Vector3(-0.3, 2.4, 14.5),
                new THREE.Vector3(1.2, 4.6, 17.0),
                new THREE.Vector3(2.8, 4.2, 19.5),
                new THREE.Vector3(2.6, 2.5, 20.2),
                new THREE.Vector3(1.7, 0.9, 18.2)
            ],
            intakePos: new THREE.Vector3(-0.35, 0.55, 12.8),
            exitPos: new THREE.Vector3(1.7, 0.9, 18.2),
            exitVelocity: new THREE.Vector3(-0.2, 0.1, 7.5)
        });
        pipe1.level = 1;
        this.warpPipes.push(pipe1);

        // 4. GATE x3 at exit of Pipe 1 (Z = 18.2, X = 1.7)
        const gatePipeExit = this.createMultiplierGate('gate_3', 1.7, 18.4, 2.6, {
            type: 'mult',
            val: 3,
            label: 'x3'
        });
        gatePipeExit.level = 1;
        this.gates.push(gatePipeExit);

        // 5. RED ENEMY BARRACKS 1 (Left: HP 30) at Z = 25.5
        const barracks1 = this.createEnemyBarracks({
            x: -1.8,
            z: 25.5,
            width: 2.2,
            height: 2.6,
            depth: 2.0,
            hp: 30,
            maxHp: 30,
            spawnInterval: 0.65,
            id: 'barracks_43'
        });
        barracks1.level = 1;
        this.enemyBarracks.push(barracks1);

        // 6. GATE x2 behind Barracks 1
        const gate3 = this.createMultiplierGate('gate_4', -1.8, 29.5, 2.0, { type: 'mult', val: 2, label: 'x2' });
        gate3.level = 1;
        this.gates.push(gate3);

        // 7. YELLOW BLOCK 2 (Right: HP 35) at Z = 27.0
        const yellowBlock2 = this.createYellowHpBlock({
            x: 1.6,
            z: 27.0,
            width: 2.2,
            height: 1.2,
            depth: 1.2,
            hp: 35,
            id: 'block_50'
        });
        yellowBlock2.level = 1;
        this.yellowBlocks.push(yellowBlock2);

        const gate4 = this.createMultiplierGate('gate_5', 1.6, 28.5, 2.0, { type: 'add', val: 5, label: '+5' });
        gate4.level = 1;
        this.gates.push(gate4);

        // 8. RED ENEMY BARRACKS 2 (Center-Left: HP 45 - Level 1 Boss Castle) at Z = 41.0
        const barracks2 = this.createEnemyBarracks({
            x: -1.6,
            z: 41.0,
            width: 2.4,
            height: 3.0,
            depth: 2.2,
            hp: 45,
            maxHp: 45,
            spawnInterval: 0.55,
            id: 'barracks_50'
        });
        barracks2.level = 1;
        this.enemyBarracks.push(barracks2);

        // ================= LEVEL 2: SUPER HARD LEVEL (Z: 50 -> 125) =================
        // Baseline 2 is at Z = 50.0 (Cannon will move to Z = 48.0)

        // 1. Double High-speed Multiplier Gates at Z = 63.5
        const l2Gate1 = this.createMultiplierGate('l2_gate_1', -1.8, 63.5, 2.6, { type: 'mult', val: 3, label: 'x3' });
        l2Gate1.level = 2;
        this.gates.push(l2Gate1);

        const l2Gate2 = this.createMultiplierGate('l2_gate_2', 1.8, 63.5, 2.6, { type: 'mult', val: 2, label: 'x2' });
        l2Gate2.level = 2;
        this.gates.push(l2Gate2);

        // 2. Twin Warp Pipes (Crossing Pipe System) at Z = 65 -> 74
        const pipe2 = this.createWarpPipe({
            points: [
                new THREE.Vector3(-1.8, 0.55, 66.0),
                new THREE.Vector3(-1.2, 2.8, 68.5),
                new THREE.Vector3(0.0, 4.8, 71.0),
                new THREE.Vector3(1.4, 3.2, 73.0),
                new THREE.Vector3(1.8, 0.9, 74.5)
            ],
            intakePos: new THREE.Vector3(-1.8, 0.55, 66.0),
            exitPos: new THREE.Vector3(1.8, 0.9, 74.5),
            exitVelocity: new THREE.Vector3(0, 0, 8.0)
        });
        pipe2.level = 2;
        this.warpPipes.push(pipe2);

        // 3. Massive HP Fortress Block in the middle (HP 250) at Z = 73.0
        const l2YellowBlock1 = this.createYellowHpBlock({
            x: -1.6,
            z: 73.0,
            width: 2.6,
            height: 1.5,
            depth: 1.4,
            hp: 250,
            id: 'l2_block_1'
        });
        l2YellowBlock1.level = 2;
        this.yellowBlocks.push(l2YellowBlock1);

        const l2Gate3 = this.createMultiplierGate('l2_gate_3', 1.8, 75.0, 2.4, { type: 'mult', val: 4, label: 'x4' });
        l2Gate3.level = 2;
        this.gates.push(l2Gate3);

        // 4. Heavy Vanguard Enemy Bunker at Z = 82.0 (HP 80, fast spawn rate 0.35s)
        const l2Barracks1 = this.createEnemyBarracks({
            x: 1.7,
            z: 82.0,
            width: 2.4,
            height: 2.8,
            depth: 2.2,
            hp: 80,
            maxHp: 80,
            spawnInterval: 0.35,
            id: 'l2_barracks_1'
        });
        l2Barracks1.level = 2;
        this.enemyBarracks.push(l2Barracks1);

        // 5. Gate x5 Behind Vanguard at Z = 87.0
        const l2Gate4 = this.createMultiplierGate('l2_gate_4', -1.7, 87.0, 2.6, { type: 'mult', val: 5, label: 'x5' });
        l2Gate4.level = 2;
        this.gates.push(l2Gate4);

        // 6. Secondary Heavy Outpost at Z = 92.0 (HP 90)
        const l2Barracks2 = this.createEnemyBarracks({
            x: -1.7,
            z: 92.0,
            width: 2.4,
            height: 2.8,
            depth: 2.2,
            hp: 90,
            maxHp: 90,
            spawnInterval: 0.32,
            id: 'l2_barracks_2'
        });
        l2Barracks2.level = 2;
        this.enemyBarracks.push(l2Barracks2);

        // 7. FINAL MEGA BOSS CASTLE (Center: HP 150 - Super Hard Mega Boss) at Z = 108.0
        const l2MegaBoss = this.createEnemyBarracks({
            x: 0.0,
            z: 108.0,
            width: 3.2,
            height: 3.6,
            depth: 2.6,
            hp: 150,
            maxHp: 150,
            spawnInterval: 0.28,
            id: 'l2_megaboss'
        });
        l2MegaBoss.level = 2;
        this.enemyBarracks.push(l2MegaBoss);
    }

    createMultiplierGate(id, x, z, width, data) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const isGreenTheme = data.val >= 3 || data.type === 'mult';
        const height = 1.6;

        const frameMat = new THREE.MeshStandardMaterial({
            color: isGreenTheme ? 0x10b981 : 0x0284c7,
            roughness: 0.3,
            metalness: 0.2
        });

        const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.12), frameMat);
        p1.position.set(-width / 2 + 0.06, height / 2, 0);
        group.add(p1);

        const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.12), frameMat);
        p2.position.set(width / 2 - 0.06, height / 2, 0);
        group.add(p2);

        const energyMat = new THREE.MeshBasicMaterial({
            color: isGreenTheme ? 0x34d399 : 0x38bdf8,
            transparent: true,
            opacity: 0.65,
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
        if (isGreenTheme) {
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
        ctx.strokeStyle = isGreenTheme ? '#064e3b' : '#082f49';
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
            group: group,
            x: x,
            z: z,
            width: width,
            data: data,
            onPass: () => {
                energyMat.opacity = 1.0;
                setTimeout(() => { energyMat.opacity = 0.65; }, 150);
            }
        };
    }

    createYellowHpBlock(config) {
        const group = new THREE.Group();
        group.position.set(config.x, config.height / 2, config.z);

        const blockMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            roughness: 0.35,
            metalness: 0.1
        });
        const blockGeo = new THREE.BoxGeometry(config.width, config.height, config.depth);
        const blockMesh = new THREE.Mesh(blockGeo, blockMat);
        blockMesh.castShadow = true;
        blockMesh.receiveShadow = true;
        group.add(blockMesh);

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');

        const updateLabel = (hp) => {
            ctx.clearRect(0, 0, 256, 160);
            ctx.font = '900 96px "Arial Black", Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 18;
            ctx.strokeStyle = '#1e293b';
            ctx.strokeText(`${Math.max(0, Math.ceil(hp))}`, 128, 80);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${Math.max(0, Math.ceil(hp))}`, 128, 80);
        };
        updateLabel(config.hp);

        const labelTex = new THREE.CanvasTexture(canvas);
        const labelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(config.width * 0.9, config.height * 0.8),
            new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, side: THREE.FrontSide })
        );
        labelMesh.position.set(0, 0, -config.depth / 2 - 0.02);
        labelMesh.rotation.set(0, Math.PI, 0);
        group.add(labelMesh);

        this.scene.add(group);

        const blockObj = {
            id: config.id,
            group: group,
            blockMesh: blockMesh,
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
                this.spawnDebrisExplosion(group.position, 0xf59e0b, 16);
                group.visible = false;
            }
        };

        return blockObj;
    }

    createWarpPipe(config) {
        const curve = new THREE.CatmullRomCurve3(config.points);
        const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.45, 16, false);

        const pipeMat = new THREE.MeshStandardMaterial({
            color: 0x16a34a,
            roughness: 0.3,
            metalness: 0.15
        });
        const pipeMesh = new THREE.Mesh(tubeGeo, pipeMat);
        pipeMesh.castShadow = true;
        this.scene.add(pipeMesh);

        const intakeRingGeo = new THREE.TorusGeometry(0.50, 0.12, 12, 24);
        const intakeRing = new THREE.Mesh(intakeRingGeo, new THREE.MeshStandardMaterial({ color: 0x15803d }));
        intakeRing.position.copy(config.intakePos);
        this.scene.add(intakeRing);

        const intakeHole = new THREE.Mesh(new THREE.CircleGeometry(0.44, 16), new THREE.MeshBasicMaterial({ color: 0x052e16 }));
        intakeHole.position.copy(config.intakePos).add(new THREE.Vector3(0, 0, 0.02));
        this.scene.add(intakeHole);

        const exitRing = new THREE.Mesh(intakeRingGeo, new THREE.MeshStandardMaterial({ color: 0x15803d }));
        exitRing.position.copy(config.exitPos);
        this.scene.add(exitRing);

        return {
            curve: curve,
            intakePos: config.intakePos,
            exitPos: config.exitPos,
            exitVelocity: config.exitVelocity,
            mesh: pipeMesh
        };
    }

    createEnemyBarracks(config) {
        const group = new THREE.Group();
        group.position.set(config.x, 0, config.z);

        const redMainMat = new THREE.MeshStandardMaterial({ color: 0xff4136, roughness: 0.35, metalness: 0.1 });
        const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x3d0c0c, roughness: 0.6 });
        const doorInnerMat = new THREE.MeshStandardMaterial({ color: 0x8a3324, roughness: 0.5 });
        const woodPoleMat = new THREE.MeshStandardMaterial({ color: 0x8d5b4c, roughness: 0.7 });
        const brightRedFlagMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide });

        const bW = config.width || 2.2;
        const bH = config.height || 2.6;
        const bD = config.depth || 2.0;

        // 1. Dark Foundation Base Rim
        const baseRim = new THREE.Mesh(new THREE.BoxGeometry(bW * 1.04, 0.28, bD * 1.04), darkTrimMat);
        baseRim.position.y = 0.14;
        baseRim.castShadow = true;
        group.add(baseRim);

        // 2. Main Red Building Body (Blocky Bunker)
        const mainBody = new THREE.Mesh(new THREE.BoxGeometry(bW, bH * 0.95, bD), redMainMat);
        mainBody.position.y = (bH * 0.95) / 2 + 0.14;
        mainBody.castShadow = true;
        mainBody.receiveShadow = true;
        group.add(mainBody);

        // 3. Dark Upper Roof Cap / Trim
        const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(bW * 1.05, 0.22, bD * 1.05), darkTrimMat);
        roofTrim.position.y = bH * 0.95 + 0.14 + 0.11;
        roofTrim.castShadow = true;
        group.add(roofTrim);

        // 4. Dark Side Pillars (Left & Right trims)
        [-bW / 2 - 0.02, bW / 2 + 0.02].forEach(px => {
            const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.12, bH * 0.95, bD * 0.8), darkTrimMat);
            sideTrim.position.set(px, (bH * 0.95) / 2 + 0.14, 0);
            group.add(sideTrim);
        });

        // 5. Entrance Doorway with Overhang Canopy
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

        // Little red emblem/crest on door canopy
        const canopyCrest = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), redMainMat);
        canopyCrest.position.set(0, 0.98, -bD / 2 - 0.26);
        group.add(canopyCrest);

        // Small square dark windows on bottom sides
        [-bW * 0.36, bW * 0.36].forEach(wx => {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), doorInnerMat);
            win.position.set(wx, 0.85, -bD / 2 - 0.02);
            win.rotation.y = Math.PI;
            group.add(win);
        });

        // 6. Wooden Flagpole & Bright Red Flag on Top
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4), woodPoleMat);
        pole.position.set(0, bH + 0.65, 0);
        group.add(pole);

        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), brightRedFlagMat);
        flag.position.set(0.38, bH + 1.05, 0);
        group.add(flag);

        // 7. Framed High-Contrast Rectangular Display Screen (for HP Number)
        const canvas = document.createElement('canvas');
        canvas.width = 380;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');

        const updateHpLabel = (hp) => {
            ctx.clearRect(0, 0, 380, 200);

            // Screen dark burgundy background
            ctx.fillStyle = '#8b2e2b';
            this.roundRect(ctx, 8, 8, 364, 184, 18, true, false);

            // Screen dark frame border
            ctx.lineWidth = 14;
            ctx.strokeStyle = '#2b0909';
            this.roundRect(ctx, 8, 8, 364, 184, 18, false, true);

            // White crisp bold number with thick navy/black shadow outline
            ctx.font = '900 130px "Arial Black", Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 26;
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
        // Positioned neatly in the upper floor of the bunker front face
        hpScreen.position.set(0, bH * 0.65 + 0.15, -bD / 2 - 0.05);
        hpScreen.rotation.set(0, Math.PI, 0);
        group.add(hpScreen);

        this.scene.add(group);

        const barracksObj = {
            id: config.id,
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

                // Punch scale effect on hit
                group.scale.set(1.1, 0.92, 1.1);
                setTimeout(() => {
                    if (group) group.scale.set(1.0, 1.0, 1.0);
                }, 80);
            },
            onDestroy: () => {
                this.spawnDebrisExplosion(group.position, 0xdc2626, 20);
                group.visible = false;
            }
        };

        return barracksObj;
    }

    loadPlayerModels() {
        const loader = new GLTFLoader();

        const loadModel = (url) => {
            return fetch(url)
                .then(res => res.arrayBuffer())
                .then(buffer => new Promise((resolve, reject) => {
                    loader.parse(buffer, '', resolve, (err) => {
                        loader.load(url, resolve, undefined, reject);
                    });
                }))
                .catch(() => new Promise((resolve, reject) => {
                    loader.load(url, resolve, undefined, reject);
                }));
        };

        Promise.all([loadModel(alliedModelUrl), loadModel(enemyModelUrl)])
            .then(([alliedGltf, enemyGltf]) => {
                // 1. ALLIED TROOPS: Athlete_05.glb with original model texture & skinning enabled
                this.bluePlayerBaseModel = alliedGltf.scene;
                this.bluePlayerBaseModel.scale.set(0.48, 0.48, 0.48);
                this.bluePlayerBaseModel.traverse((node) => {
                    if (node.isMesh || node.isSkinnedMesh) {
                        node.castShadow = false;
                        node.receiveShadow = false;
                        if (node.material) {
                            node.material = node.material.clone();
                            node.material.skinning = true;
                            node.material.needsUpdate = true;
                        }
                    }
                });

                // 2. ENEMY TROOPS: Skin_BF14.glb with Red Tint
                this.redPlayerBaseModel = enemyGltf.scene;
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
                console.log('Models loaded: Allied (Athlete_05 original) & Enemy (Skin_BF14 red)');
            })
            .catch((err) => {
                console.warn('Model loading fallback:', err);
                this.fallbackHero();
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
            vx: (Math.random() - 0.5) * 0.3,
            vz: this.enemySpeed,
            animOffset: Math.random() * 2.0,
            isAlive: true
        };

        this.enemyMobs.push(mob);
        return mob;
    }

    setupEventListeners() {
        let isDragging = false;
        let startPointerX = 0;
        let startCannonX = 0;

        const onPointerDown = (e) => {
            isDragging = true;
            this.isPlayerInteracted = true;
            startPointerX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            startCannonX = this.cannonX;
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
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

        // Explode Cannon into debris
        this.spawnDebrisExplosion(this.cannonGroup.position, 0x0284c7, 18);
        this.cannonGroup.visible = false;

        this.onGameOver();
    }

    update() {
        const delta = Math.min(this.clock.getDelta(), 0.08);
        this.animTime += delta;

        this.cannonX += (this.targetCannonX - this.cannonX) * 16 * delta;
        this.cannonX = THREE.MathUtils.clamp(this.cannonX, this.minCannonX, this.maxCannonX);
        this.cannonGroup.position.x = this.cannonX;

        const wheelTurn = (this.targetCannonX - this.cannonX) * 18 * delta;
        this.wheels.forEach(w => {
            w.rotation.x += wheelTurn;
        });

        if (this.recoilAnim > 0) {
            this.recoilAnim -= delta * 14;
            this.cannonBarrel.position.z = 0.75 - Math.max(0, this.recoilAnim) * 0.22;
        }

        if (this.muzzleFlashTimer > 0) {
            this.muzzleFlashTimer -= delta;
            this.muzzleFlash.material.opacity = Math.max(0, this.muzzleFlashTimer * 10);
        }

        if (this.isGameActive && !this.isLevelFinished) {
            // Player allied mobs shoot ONLY after player interacted AND NOT transitioning between levels
            if (this.isPlayerInteracted && !this.isTransitioning) {
                this.shootTimer += delta;
                if (this.shootTimer >= this.shootInterval && this.modelLoaded) {
                    this.shootTimer = 0;
                    this.recoilAnim = 1.0;
                    this.muzzleFlashTimer = 0.08;
                    this.spawnAlliedMob(this.cannonX + (Math.random() - 0.5) * 0.3, this.cannonZ + 1.6);
                }
            }

            // Enemy mobs spawn and advance for the active level
            if (!this.isTransitioning) {
                this.enemyBarracks.filter(b => b.level === this.currentLevel).forEach(barracks => {
                    if (barracks.isDestroyed) return;
                    barracks.spawnTimer += delta;
                    if (barracks.spawnTimer >= barracks.spawnInterval && this.modelLoaded) {
                        barracks.spawnTimer = 0;
                        this.spawnEnemyMob(barracks.x + (Math.random() - 0.5) * 0.8, barracks.z - 1.2);
                    }
                });
            }

            this.updateAlliedMobs(delta);
            this.updateEnemyMobs(delta);
            this.handleCombatAndInteractions();

            const activeLevelBarracks = this.enemyBarracks.filter(b => b.level === this.currentLevel);
            const allDestroyed = activeLevelBarracks.length > 0 && activeLevelBarracks.every(b => b.isDestroyed);

            if (allDestroyed && !this.isLevelFinished && !this.isTransitioning) {
                if (this.currentLevel === 1) {
                    this.advanceToLevel2();
                } else {
                    this.isLevelFinished = true;
                    this.onLevelComplete();
                }
            }
        }

        // Camera smoothly follows cannon during gameplay and transitions
        const targetCamZ = this.cannonZ + this.cameraZOffset;
        const targetCamY = this.cameraYOffset;
        const targetLookZ = this.cannonZ + this.targetCameraLookZ;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * 5 * delta;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 5 * delta;
        this.camera.lookAt(0, 0, targetLookZ);

        this.updateDebrisAndParticles(delta);
        this.renderer.render(this.scene, this.camera);
    }

    advanceToLevel2() {
        this.isTransitioning = true;
        this.currentLevel = 2;

        // 1. Destroy and blow up all remaining Level 1 objects (gates, yellow blocks, pipes)
        this.gates.filter(g => g.level === 1).forEach(g => {
            this.spawnDebrisExplosion(g.group.position, 0x10b981, 14);
            this.scene.remove(g.group);
        });

        this.yellowBlocks.filter(yb => yb.level === 1).forEach(yb => {
            this.spawnDebrisExplosion(yb.group.position, 0xf59e0b, 16);
            this.scene.remove(yb.group);
        });

        this.warpPipes.filter(wp => wp.level === 1).forEach(wp => {
            this.spawnDebrisExplosion(wp.intakePos, 0x22c55e, 12);
            this.scene.remove(wp.mesh);
        });

        // Clear existing allied mobs that passed
        this.alliedMobs.forEach(m => {
            this.spawnSparkBurst(m.x, 0.6, m.z, 0x38bdf8);
            this.scene.remove(m.model);
        });
        this.alliedMobs = [];

        // 2. Animate Cannon smoothly rolling forward from Z = -2.0 to Level 2 Baseline at Z = 48.0
        const startZ = this.cannonZ;
        const targetZ = 48.0;
        const startX = this.cannonX;
        const targetX = 0;
        const duration = 2.4; // 2.4s cinematic march
        let elapsed = 0;

        const marchInterval = setInterval(() => {
            elapsed += 0.03;
            const progress = Math.min(1.0, elapsed / duration);
            // Ease in-out cubic
            const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            this.cannonZ = startZ + (targetZ - startZ) * ease;
            this.cannonX = startX + (targetX - startX) * ease;
            this.targetCannonX = this.cannonX;
            this.cannonGroup.position.set(this.cannonX, 0, this.cannonZ);

            // Roll wheels while moving forward
            this.wheels.forEach(w => {
                w.rotation.x += 0.35;
            });

            if (progress >= 1.0) {
                clearInterval(marchInterval);
                this.cannonZ = targetZ;
                this.cannonX = 0;
                this.levelBaselineZ = 50.0;
                this.isTransitioning = false;
                this.isPlayerInteracted = true; // Resume shooting immediately upon arriving at Level 2 baseline
                this.shootTimer = 0;
                this.onLevel2Arrived();
            }
        }, 30);
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

            if (mob.inPipe) {
                mob.pipeT += delta * 1.35;
                if (mob.pipeT >= 1.0) {
                    mob.model.position.copy(mob.inPipe.exitPos);
                    mob.x = mob.inPipe.exitPos.x;
                    mob.z = mob.inPipe.exitPos.z;
                    mob.vx = (Math.random() - 0.5) * 0.8;
                    mob.vz = this.alliedSpeed * 1.05;
                    mob.inPipe = null;

                    this.spawnSparkBurst(mob.x, 1.0, mob.z, 0x22c55e);
                } else {
                    const pt = mob.inPipe.curve.getPointAt(mob.pipeT);
                    mob.model.position.copy(pt);
                    mob.x = pt.x;
                    mob.z = pt.z;
                    continue;
                }
            } else {
                // Steering only when close to objective or direct combat
                let targetX = mob.x;
                let hasTarget = false;

                // Priority 1: Seek nearest active Enemy when close in front (< 3.5m)
                let closestEnemyDist = 999;
                let enemyTargetX = 0;
                for (let e = 0; e < this.enemyMobs.length; e++) {
                    const enemy = this.enemyMobs[e];
                    if (enemy.isAlive && enemy.z > mob.z && (enemy.z - mob.z) < 3.5) {
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
                    // Priority 2: Seek nearest undestroyed Enemy Barracks ONLY when close (< 8.0m)
                    let closestBarracksDist = 999;
                    let barracksTargetX = 0;
                    for (let b = 0; b < this.enemyBarracks.length; b++) {
                        const barracks = this.enemyBarracks[b];
                        if (!barracks.isDestroyed && barracks.z > mob.z && (barracks.z - mob.z) < 8.0) {
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

                // Smooth steering towards target X when close; otherwise maintain straight path
                if (hasTarget) {
                    const diffX = targetX - mob.x;
                    mob.vx += THREE.MathUtils.clamp(diffX * 3.5 - mob.vx, -4.5, 4.5) * delta;
                } else {
                    // Naturally return to straight forward velocity
                    mob.vx *= (1 - delta * 4.0);
                }

                mob.z += mob.vz * delta;
                mob.x += mob.vx * delta;
                mob.x = THREE.MathUtils.clamp(mob.x, -3.4, 3.4);

                const hop = Math.abs(Math.sin((this.animTime + mob.animOffset) * 6.6)) * 0.08;
                mob.model.position.set(mob.x, hop, mob.z);

                // Face moving direction smoothly
                const headingAngle = Math.atan2(mob.vx, mob.vz);
                mob.model.rotation.y = headingAngle * 0.75;
                mob.model.rotation.x = 0.12;
                mob.model.rotation.z = Math.sin((this.animTime + mob.animOffset) * 6.6) * 0.05;
            }

            this.animateMobBones(mob, false);

            this.warpPipes.forEach(pipe => {
                if (mob.inPipe) return;
                const dx = mob.x - pipe.intakePos.x;
                const dz = mob.z - pipe.intakePos.z;
                if (Math.abs(dx) < 0.65 && Math.abs(dz) < 0.85) {
                    mob.inPipe = pipe;
                    mob.pipeT = 0;
                }
            });

            const maxTrackZ = this.currentLevel === 1 ? 55 : 130;
            if (mob.z > maxTrackZ) {
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

            // --- DEFEAT CONDITION: Enemy crosses Active Level Baseline ---
            if (!this.isTransitioning && mob.z <= this.levelBaselineZ) {
                this.triggerGameOver();
                return;
            }
        }
    }

    handleCombatAndInteractions() {
        // 1. ALLIED MOBS vs GATES
        this.gates.forEach(g => {
            this.alliedMobs.forEach(mob => {
                if (!mob.isAlive || mob.inPipe) return;
                if (mob.passedGates.has(g.id)) return;

                const dz = mob.z - g.z;
                const dx = mob.x - g.x;

                if (Math.abs(dz) < 0.7 && Math.abs(dx) < g.width / 2) {
                    mob.passedGates.add(g.id);
                    g.onPass();

                    let countToAdd = 0;
                    if (g.data.type === 'mult') {
                        countToAdd = Math.min(12, g.data.val * 2 - 1);
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
            });
        });

        // 2. ALLIED MOBS vs YELLOW HP BLOCKS
        this.yellowBlocks.forEach(block => {
            if (block.isDestroyed) return;
            this.alliedMobs.forEach(mob => {
                if (!mob.isAlive || mob.inPipe) return;
                const dz = mob.z - block.z;
                const dx = mob.x - block.x;

                if (Math.abs(dz) < block.depth / 2 + 0.3 && Math.abs(dx) < block.width / 2 + 0.2) {
                    mob.isAlive = false;
                    block.hp -= 2;
                    block.onHit(2);
                    this.spawnSparkBurst(mob.x, 0.6, mob.z, 0xf59e0b);

                    if (block.hp <= 0 && !block.isDestroyed) {
                        block.isDestroyed = true;
                        block.onDestroy();
                        this.onCoinCollect({ amount: 200 });
                    }
                }
            });
        });

        // 3. ALLIED MOBS vs ENEMY MOBS (1-to-1 annihilation)
        this.alliedMobs.forEach(allied => {
            if (!allied.isAlive || allied.inPipe) return;
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
            if (barracks.isDestroyed) return;
            this.alliedMobs.forEach(mob => {
                if (!mob.isAlive || mob.inPipe) return;
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

    spawnDebrisExplosion(pos, hexColor, count = 12) {
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

    createTextSprite(text, options = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = `${options.fontSize || 48}px "Arial Black", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = options.textColor || '#ffffff';
        ctx.fillText(text, 128, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        return new THREE.Sprite(mat);
    }
}
