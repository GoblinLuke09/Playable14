// 3D Chibi Stickman Runner Spritesheet Generator (Count Masters / Mob Control Style)
// Solid vibrant cartoon colors with subtle black outlines (no gloss highlights)

export function generate3DRunnerFrames(scene, colorTheme = 'blue') {
    const isBlue = colorTheme === 'blue';
    const prefix = isBlue ? 'blue_run_' : 'red_run_';
    const frameCount = 8;
    const width = 72;
    const height = 80;

    // Solid cartoon colors with crisp black outline
    const colors = isBlue ? {
        // Player: Warm Golden Orange Skin (matching reference image)
        body: '#f59e0b',
        shorts: '#0ea5e9',
        belt: '#dc2626',
        sash: '#ef4444',
        sashStitch: '#ffffff',
        clubHead: '#06b6d4',
        spike: '#ef4444',
        handle: '#78350f',
        handleWrap: '#0284c7',
        sole: '#18181b',
        outline: '#18181b',
        shadow: 'rgba(0, 0, 0, 0.25)'
    } : {
        // Red Enemy Soldier
        body: '#ef4444',
        shorts: '#334155',
        belt: '#991b1b',
        sash: '#7f1d1d',
        sashStitch: '#fca5a5',
        clubHead: '#475569',
        spike: '#ef4444',
        handle: '#450a0a',
        handleWrap: '#1e293b',
        sole: '#18181b',
        outline: '#18181b',
        shadow: 'rgba(0, 0, 0, 0.25)'
    };

    // Helper: Draw Solid Sphere with subtle black outline (Head / Hands / Joints)
    function drawSphere(ctx, cx, cy, radius, fillColor = colors.body, outlineColor = colors.outline, lineWidth = 1.1) {
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        if (outlineColor) {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
        ctx.restore();
    }

    // Helper: Draw Solid Limb / Torso Capsule with subtle black outline
    function drawCapsule(ctx, x1, y1, x2, y2, radius, fillColor = colors.body, outlineColor = colors.outline, lineWidth = 1.1) {
        ctx.save();
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) {
            ctx.restore();
            return;
        }
        const angle = Math.atan2(dy, dx);

        ctx.translate(x1, y1);
        ctx.rotate(angle);

        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.arc(0, 0, radius, Math.PI / 2, -Math.PI / 2);
        ctx.lineTo(len, -radius);
        ctx.arc(len, 0, radius, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        ctx.fill();

        if (outlineColor) {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }

        ctx.restore();
    }

    // Helper: Draw Spiked Club Weapon with subtle black outline
    function drawSpikedClub(ctx, handX, handY) {
        ctx.save();
        const clubAngle = 0.25; // slants slightly outward from right hand
        ctx.translate(handX, handY);
        ctx.rotate(clubAngle);

        // Handle
        ctx.fillStyle = colors.handle;
        ctx.fillRect(-2, -5, 4, 13);
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = 0.9;
        ctx.strokeRect(-2, -5, 4, 13);

        // Handle grip wraps
        ctx.strokeStyle = colors.handleWrap;
        ctx.lineWidth = 1.2;
        for (let y = -3; y <= 5; y += 3) {
            ctx.beginPath();
            ctx.moveTo(-2, y);
            ctx.lineTo(2, y - 1);
            ctx.stroke();
        }

        // Cyan Club Head (tapered cylinder/bat)
        const clubLen = 20;
        ctx.fillStyle = colors.clubHead;
        ctx.beginPath();
        ctx.moveTo(-2.5, -5);
        ctx.lineTo(-5.2, -clubLen);
        ctx.arc(0, -clubLen, 5.2, Math.PI, 0);
        ctx.lineTo(2.5, -5);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Red Spikes on club with black outline
        function drawSpike(sx, sy, angle, len) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(angle);
            ctx.fillStyle = colors.spike;
            ctx.beginPath();
            ctx.moveTo(0, -1.6);
            ctx.lineTo(len, 0);
            ctx.lineTo(0, 1.6);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = colors.outline;
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.restore();
        }

        // Left spikes
        drawSpike(-5.0, -clubLen + 2, Math.PI, 3.8);
        drawSpike(-4.5, -clubLen + 8, Math.PI, 3.6);
        drawSpike(-3.8, -clubLen + 14, Math.PI, 3.4);

        // Right spikes
        drawSpike(5.0, -clubLen + 2, 0, 3.8);
        drawSpike(4.5, -clubLen + 8, 0, 3.6);
        drawSpike(3.8, -clubLen + 14, 0, 3.4);

        // Top spike
        drawSpike(0, -clubLen - 5.0, -Math.PI / 2, 3.8);

        // Red center studs
        ctx.fillStyle = colors.spike;
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = 0.7;

        [-clubLen + 3, -clubLen + 9, -clubLen + 15].forEach(yPos => {
            ctx.beginPath();
            ctx.arc(0, yPos, 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        ctx.restore();
    }

    // Helper: Draw Running Shoe with visible sole facing camera when kicked back
    function drawShoe(ctx, x, y, cycleVal) {
        ctx.save();
        if (cycleVal < -0.2) {
            const shoeRadius = 4.0;

            // Outer shoe body (solid skin color + black outline)
            ctx.fillStyle = colors.body;
            ctx.beginPath();
            ctx.ellipse(x, y, shoeRadius * 1.1, shoeRadius * 1.25, -0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = colors.outline;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            // Dark rubber sole facing viewer
            ctx.fillStyle = colors.sole;
            ctx.beginPath();
            ctx.ellipse(x, y + 0.5, shoeRadius * 0.85, shoeRadius * 0.95, -0.15, 0, Math.PI * 2);
            ctx.fill();

            // Sole tread detail
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - 1.5, y - 1, 3, 1.0);
            ctx.fillRect(x - 1.5, y + 1.2, 3, 1.0);
        } else {
            // FORWARD / PLANT PHASE: Solid shoe sphere with black outline
            drawSphere(ctx, x, y, 3.8, colors.body, colors.outline, 1.0);
        }
        ctx.restore();
    }

    // Helper: Calculate Leg Kinematics (High Back-Kick & Forward Drive)
    function computeLeg(hipX, hipY, legPhase) {
        const cycle = Math.sin(legPhase); // -1 (max kickback) to +1 (max forward plant)
        let kneeX, kneeY, footX, footY;

        if (cycle >= 0) {
            // Forward stride & plant phase
            const t = cycle; // 0 to 1
            const thighAngle = 0.15 - t * 0.55; // swings forward
            kneeX = hipX + Math.sin(thighAngle) * 9.5;
            kneeY = hipY + Math.cos(thighAngle) * 9.5;

            const shinAngle = thighAngle + 0.15 + (1 - t) * 0.25;
            footX = kneeX + Math.sin(shinAngle) * 9.5;
            footY = kneeY + Math.cos(shinAngle) * 9.5;
        } else {
            // High back-kick phase: Knee bends sharply, foot lifts high up behind
            const t = -cycle; // 0 to 1
            const thighAngle = 0.15 + t * 0.65; // thigh tilts back & up
            kneeX = hipX + Math.sin(thighAngle) * 9.0;
            kneeY = hipY + Math.cos(thighAngle) * 9.0;

            // Sharp backward knee bend (shin folds up behind)
            const shinAngle = thighAngle - Math.PI * (0.42 + t * 0.48);
            footX = kneeX + Math.sin(shinAngle) * 9.2;
            footY = kneeY + Math.cos(shinAngle) * 9.2;
        }

        return { kneeX, kneeY, footX, footY, cycle };
    }

    const frameKeys = [];

    // Render 8-frame cute dynamic running cycle (viewed from 3/4 back)
    for (let f = 0; f < frameCount; f++) {
        const frameKey = `${prefix}${f}`;
        frameKeys.push(frameKey);

        if (scene.textures.exists(frameKey)) {
            scene.textures.remove(frameKey);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;

        const phase = (f / frameCount) * Math.PI * 2;
        // Athletic bounce & slight torso roll
        const bob = Math.abs(Math.sin(phase)) * 4.2;
        const centerX = width / 2;
        const pelvisY = 48 - bob;
        const bodyTilt = Math.sin(phase) * 0.05; // natural running sway

        // 1. Soft Ground Shadow
        const shadowScale = 1 - bob * 0.06;
        ctx.fillStyle = colors.shadow;
        ctx.beginPath();
        ctx.ellipse(centerX, height - 6, 15 * shadowScale, 4.8 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Leg Kinematics Calculation
        const leftLeg = computeLeg(centerX - 5.5, pelvisY, phase);
        const rightLeg = computeLeg(centerX + 5.5, pelvisY, phase + Math.PI);

        // 3. Arm Kinematics (Athletic running pump on each flank - never behind back)
        function computeArm(shoulderX, shoulderY, armPhase, isRightArm) {
            const sideDir = isRightArm ? 1 : -1;
            const swing = Math.sin(armPhase); // +1 = forward pump, -1 = backward elbow drive

            // Elbow stays on the side, moving up-forward / down-back
            const elbowX = shoulderX + sideDir * (3.0 + Math.abs(swing) * 1.0);
            const elbowY = shoulderY + 7.5 - swing * 3.8;

            // Hand/fist curls forward/up in front of chest/hip, never crossing center
            const handX = elbowX - sideDir * (1.8 + Math.max(0, swing) * 1.5);
            const handY = elbowY - 5.5 - swing * 2.5;

            return { shoulderX, shoulderY, elbowX, elbowY, handX, handY };
        }

        const lShoulderX = centerX - 9.0;
        const lShoulderY = pelvisY - 14;
        const rShoulderX = centerX + 9.0;
        const rShoulderY = pelvisY - 14;

        // Synchronize arm swing with leg stride
        const leftArm = computeArm(lShoulderX, lShoulderY, phase, false);
        const rightArm = computeArm(rShoulderX, rShoulderY, phase + Math.PI, true);

        // 4. DRAWING ORDER (Z-Sorting for 3/4 Back View):
        // (a) Right Arm (Far Flank) + Spiked Club Weapon
        drawCapsule(ctx, rightArm.shoulderX, rightArm.shoulderY, rightArm.elbowX, rightArm.elbowY, 3.2);
        drawCapsule(ctx, rightArm.elbowX, rightArm.elbowY, rightArm.handX, rightArm.handY, 2.8);
        drawSphere(ctx, rightArm.handX, rightArm.handY, 3.2);
        drawSpikedClub(ctx, rightArm.handX, rightArm.handY);

        // (b) Right Leg
        drawCapsule(ctx, centerX + 5.5, pelvisY, rightLeg.kneeX, rightLeg.kneeY, 4.0);
        drawCapsule(ctx, rightLeg.kneeX, rightLeg.kneeY, rightLeg.footX, rightLeg.footY, 3.5);
        drawShoe(ctx, rightLeg.footX, rightLeg.footY, rightLeg.cycle);

        // (c) Left Leg
        drawCapsule(ctx, centerX - 5.5, pelvisY, leftLeg.kneeX, leftLeg.kneeY, 4.0);
        drawCapsule(ctx, leftLeg.kneeX, leftLeg.kneeY, leftLeg.footX, leftLeg.footY, 3.5);
        drawShoe(ctx, leftLeg.footX, leftLeg.footY, leftLeg.cycle);

        // (d) Chubby Torso with Cyan Shorts & Red Ammo Sash (Viewed from Behind)
        ctx.save();
        ctx.translate(centerX, pelvisY - 7);
        ctx.rotate(bodyTilt);

        // Main solid golden-orange torso body
        drawCapsule(ctx, 0, 7, 0, -7, 8.8, colors.body, colors.outline, 1.1);

        // Cyan Shorts at lower torso
        ctx.fillStyle = colors.shorts;
        ctx.beginPath();
        ctx.arc(0, 5, 8.6, 0, Math.PI);
        ctx.lineTo(-8.6, 1);
        ctx.lineTo(8.6, 1);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Red Waistband Belt
        ctx.fillStyle = colors.belt;
        ctx.fillRect(-8.6, 0.5, 17.2, 2.2);
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-8.6, 0.5, 17.2, 2.2);

        // Red Diagonal Ammo Sash across back
        ctx.strokeStyle = colors.sash;
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.moveTo(-6.2, -8);
        ctx.lineTo(5.5, 2.5);
        ctx.stroke();

        // Ammo stitch marks
        ctx.strokeStyle = colors.sashStitch;
        ctx.lineWidth = 1.1;
        for (let t = 0.12; t <= 0.88; t += 0.18) {
            const sx = -6.2 + (5.5 - (-6.2)) * t;
            const sy = -8 + (2.5 - (-8)) * t;
            ctx.beginPath();
            ctx.moveTo(sx - 1.4, sy + 1.4);
            ctx.lineTo(sx + 1.4, sy - 1.4);
            ctx.stroke();
        }

        ctx.restore();

        // (e) Left Arm (Near Flank)
        drawCapsule(ctx, leftArm.shoulderX, leftArm.shoulderY, leftArm.elbowX, leftArm.elbowY, 3.2);
        drawCapsule(ctx, leftArm.elbowX, leftArm.elbowY, leftArm.handX, leftArm.handY, 2.8);
        drawSphere(ctx, leftArm.handX, leftArm.handY, 3.2);

        // (f) Large Cute Head (Solid Golden Orange with clean black outline)
        const headX = centerX + Math.sin(bodyTilt) * 4;
        const headY = pelvisY - 26;
        drawSphere(ctx, headX, headY, 15.5, colors.body, colors.outline, 1.2);

        scene.textures.addCanvas(frameKey, canvas);
    }

    // Register Phaser animation
    const animKey = isBlue ? 'blue_runner_run' : 'red_runner_run';
    if (scene.anims.exists(animKey)) {
        scene.anims.remove(animKey);
    }
    scene.anims.create({
        key: animKey,
        frames: frameKeys.map(k => ({ key: k })),
        frameRate: 12,
        repeat: -1
    });

    return animKey;
}

