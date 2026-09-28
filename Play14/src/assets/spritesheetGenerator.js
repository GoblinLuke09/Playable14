// 3D Chibi Stickman Runner Spritesheet Generator (Count Masters / Mob Control Style)
// Generates glossy, cute 3D stickmen running forward viewed from behind with vibrant lighting
// Features dynamic athletic running stride with high back-kick and visible shoe soles

export function generate3DRunnerFrames(scene, colorTheme = 'blue') {
    const isBlue = colorTheme === 'blue';
    const prefix = isBlue ? 'blue_run_' : 'red_run_';
    const frameCount = 8;
    const width = 64;
    const height = 76;

    // Rich Glossy 3D Candy Palette
    const colors = isBlue ? {
        lightSpec: '#ffffff',
        specular: '#bae6fd',
        bright: '#38bdf8',
        mid: '#0284c7',
        dark: '#0369a1',
        deepDark: '#0c4a6e',
        sole: '#0f172a',
        soleRim: '#38bdf8',
        shadow: 'rgba(2, 44, 80, 0.35)'
    } : {
        lightSpec: '#ffffff',
        specular: '#fecaca',
        bright: '#f87171',
        mid: '#ef4444',
        dark: '#dc2626',
        deepDark: '#7f1d1d',
        sole: '#450a0a',
        soleRim: '#f87171',
        shadow: 'rgba(90, 10, 10, 0.35)'
    };

    // Helper: Draw 3D Glossy Sphere (Head / Hands / Joints)
    function drawGlossySphere(ctx, cx, cy, radius, specOffsetX = -0.25, specOffsetY = -0.32) {
        ctx.save();
        const grad = ctx.createRadialGradient(
            cx + radius * specOffsetX,
            cy + radius * specOffsetY,
            radius * 0.08,
            cx,
            cy,
            radius
        );
        grad.addColorStop(0, colors.lightSpec);
        grad.addColorStop(0.2, colors.specular);
        grad.addColorStop(0.5, colors.bright);
        grad.addColorStop(0.85, colors.mid);
        grad.addColorStop(1, colors.dark);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Subtle soft rim
        ctx.strokeStyle = colors.deepDark;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
    }

    // Helper: Draw 3D Smooth Limb / Torso Capsule
    function drawGlossyCapsule(ctx, x1, y1, x2, y2, radius) {
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

        // Body Gradient across diameter
        const grad = ctx.createLinearGradient(0, -radius, 0, radius);
        grad.addColorStop(0, colors.specular);
        grad.addColorStop(0.25, colors.bright);
        grad.addColorStop(0.7, colors.mid);
        grad.addColorStop(1, colors.dark);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, Math.PI / 2, -Math.PI / 2);
        ctx.lineTo(len, -radius);
        ctx.arc(len, 0, radius, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        ctx.fill();

        // Top Gloss Line
        const highGrad = ctx.createLinearGradient(0, -radius, 0, 0);
        highGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
        highGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = highGrad;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.8, Math.PI / 2, -Math.PI / 2);
        ctx.lineTo(len, -radius * 0.8);
        ctx.arc(len, 0, radius * 0.8, -Math.PI / 2, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    // Helper: Draw Running Shoe with visible sole facing camera when kicked back
    function drawShoe(ctx, x, y, cycleVal) {
        ctx.save();
        if (cycleVal < -0.2) {
            // KICKED BACK PHASE: Foot is lifted high behind, showing dark sole facing camera
            const kickAmount = Math.min(1, (-cycleVal - 0.2) / 0.8);
            const shoeRadius = 4.0;

            // Outer shoe body (color match)
            ctx.fillStyle = colors.mid;
            ctx.beginPath();
            ctx.ellipse(x, y, shoeRadius * 1.1, shoeRadius * 1.25, -0.15, 0, Math.PI * 2);
            ctx.fill();

            // Dark rubber sole facing viewer
            ctx.fillStyle = colors.sole;
            ctx.beginPath();
            ctx.ellipse(x, y + 0.5, shoeRadius * 0.85, shoeRadius * 0.95, -0.15, 0, Math.PI * 2);
            ctx.fill();

            // Rubber sole tread accent & rim highlight
            ctx.strokeStyle = colors.soleRim;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.ellipse(x, y + 0.5, shoeRadius * 0.85, shoeRadius * 0.95, -0.15, 0, Math.PI * 2);
            ctx.stroke();

            // Tiny sole tread detail
            ctx.fillStyle = colors.mid;
            ctx.fillRect(x - 1.5, y - 1.5, 3, 1.2);
            ctx.fillRect(x - 1.5, y + 1, 3, 1.2);
        } else {
            // FORWARD / PLANT PHASE: Smooth 3D shoe sphere pointing down/forward
            drawGlossySphere(ctx, x, y, 3.8, -0.2, -0.2);
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
        const pelvisY = 46 - bob;
        const bodyTilt = Math.sin(phase) * 0.05; // natural running sway

        // 1. Soft Dynamic Ground Shadow
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
        // (a) Right Arm (Far Flank)
        drawGlossyCapsule(ctx, rightArm.shoulderX, rightArm.shoulderY, rightArm.elbowX, rightArm.elbowY, 3.2);
        drawGlossyCapsule(ctx, rightArm.elbowX, rightArm.elbowY, rightArm.handX, rightArm.handY, 2.8);
        drawGlossySphere(ctx, rightArm.handX, rightArm.handY, 3.2);

        // (b) Right Leg
        drawGlossyCapsule(ctx, centerX + 5.5, pelvisY, rightLeg.kneeX, rightLeg.kneeY, 4.0);
        drawGlossyCapsule(ctx, rightLeg.kneeX, rightLeg.kneeY, rightLeg.footX, rightLeg.footY, 3.5);
        drawShoe(ctx, rightLeg.footX, rightLeg.footY, rightLeg.cycle);

        // (c) Left Leg
        drawGlossyCapsule(ctx, centerX - 5.5, pelvisY, leftLeg.kneeX, leftLeg.kneeY, 4.0);
        drawGlossyCapsule(ctx, leftLeg.kneeX, leftLeg.kneeY, leftLeg.footX, leftLeg.footY, 3.5);
        drawShoe(ctx, leftLeg.footX, leftLeg.footY, leftLeg.cycle);

        // (d) Chubby Torso (Viewed from Behind with slight running sway)
        ctx.save();
        ctx.translate(centerX, pelvisY - 7);
        ctx.rotate(bodyTilt);
        drawGlossyCapsule(ctx, 0, 7, 0, -7, 8.8);
        ctx.restore();

        // (e) Left Arm (Near Flank)
        drawGlossyCapsule(ctx, leftArm.shoulderX, leftArm.shoulderY, leftArm.elbowX, leftArm.elbowY, 3.2);
        drawGlossyCapsule(ctx, leftArm.elbowX, leftArm.elbowY, leftArm.handX, leftArm.handY, 2.8);
        drawGlossySphere(ctx, leftArm.handX, leftArm.handY, 3.2);

        // (f) Large Cute 3D Glossy Sphere Head
        const headX = centerX + Math.sin(bodyTilt) * 4;
        const headY = pelvisY - 26;
        drawGlossySphere(ctx, headX, headY, 15.5, -0.25, -0.32);

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

