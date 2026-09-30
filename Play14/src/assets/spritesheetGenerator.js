// 3D Chibi Stickman Runner - Software 3D Raymarching & Phong Lighting Engine
// Renders true geometric 3D meshes with Phong lighting, surface normals, specular highlights & ambient occlusion

export function generateProjectileTexture(scene) {
    if (scene.textures.exists('spike_projectile')) {
        return 'spike_projectile';
    }
    const width = 48;
    const height = 56;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;

    const cx = width / 2;
    const cy = 24;

    // Glowing energy aura behind projectile
    const glowGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 22);
    glowGrad.addColorStop(0, 'rgba(6, 182, 212, 0.55)');
    glowGrad.addColorStop(0.7, 'rgba(6, 182, 212, 0.18)');
    glowGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();

    // Wooden handle with 3D cylindrical lighting
    const handleGrad = ctx.createLinearGradient(cx - 3, 0, cx + 3, 0);
    handleGrad.addColorStop(0, '#451a03');
    handleGrad.addColorStop(0.35, '#92400e');
    handleGrad.addColorStop(0.7, '#78350f');
    handleGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = handleGrad;
    ctx.fillRect(cx - 3, cy + 9, 6, 13);

    // Cyan ribbed grip wrap rings
    ctx.fillStyle = '#38bdf8';
    for (let gy = cy + 10; gy <= cy + 18; gy += 3) {
        ctx.fillRect(cx - 3.2, gy, 6.4, 1.2);
    }

    // Cyan spiked mace head (tapered teardrop) with 3D volumetric lighting (top-right key light)
    const headGrad = ctx.createRadialGradient(cx + 3, cy - 3, 2, cx, cy, 11);
    headGrad.addColorStop(0, '#a5f3fc');
    headGrad.addColorStop(0.25, '#22d3ee');
    headGrad.addColorStop(0.75, '#06b6d4');
    headGrad.addColorStop(1, '#0891b2');

    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 9);
    ctx.lineTo(cx - 9.5, cy);
    ctx.arc(cx, cy, 9.5, Math.PI, 0);
    ctx.lineTo(cx + 4, cy + 9);
    ctx.closePath();
    ctx.fill();

    // 3D Specular Sheen on mace surface (Top-Right)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx + 3.5, cy - 3.5, 3.2, 1.8, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // 3D Faceted Red Conical Spikes helper
    function drawSpike3D(sx, sy, angle, len) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(0, -2.6);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, 2.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawSpike3D(cx - 9.5, cy, Math.PI, 7.0);
    drawSpike3D(cx + 9.5, cy, 0, 7.0);
    drawSpike3D(cx - 7.2, cy - 7.2, Math.PI * 0.75, 6.5);
    drawSpike3D(cx + 7.2, cy - 7.2, Math.PI * 0.25, 6.5);
    drawSpike3D(cx - 6.5, cy + 6.0, Math.PI * 1.15, 6.0);
    drawSpike3D(cx + 6.5, cy + 6.0, -Math.PI * 0.15, 6.0);
    drawSpike3D(cx, cy - 9.5, -Math.PI / 2, 7.5);

    // Center 3D red hexagonal stud
    const studGrad = ctx.createRadialGradient(cx + 1, cy - 1, 0.5, cx, cy, 3.8);
    studGrad.addColorStop(0, '#f87171');
    studGrad.addColorStop(0.4, '#dc2626');
    studGrad.addColorStop(1, '#991b1b');
    ctx.fillStyle = studGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.8, 0, Math.PI * 2);
    ctx.fill();

    scene.textures.addCanvas('spike_projectile', canvas);
    return 'spike_projectile';
}

// -------------------------------------------------------------
// 3D Vector & SDF Mathematics
// -------------------------------------------------------------
function v3(x, y, z) { return [x, y, z]; }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function length(a) { return Math.hypot(a[0], a[1], a[2]); }
function normalize(a) {
    const l = Math.hypot(a[0], a[1], a[2]);
    return l > 1e-6 ? [a[0]/l, a[1]/l, a[2]/l] : [0, 0, 1];
}
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function mul(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// 3D Sphere SDF
function sdSphere(p, c, r) {
    return length(sub(p, c)) - r;
}

// 3D Capsule / Cylinder SDF
function sdCapsule(p, a, b, r) {
    const pa = sub(p, a);
    const ba = sub(b, a);
    const h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(sub(pa, mul(ba, h))) - r;
}

// Smooth Minimum (for organic 3D clay blending of joints)
function smin(d1, d2, k) {
    const h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return (1.0 - h) * d2 + h * d1 - k * h * (1.0 - h);
}

// Material IDs
const MAT_HEAD = 1;
const MAT_BODY = 2;
const MAT_SHORTS = 3;
const MAT_BELT = 4;
const MAT_SASH = 5;
const MAT_SASH_TEETH = 6;
const MAT_MACE_HEAD = 7;
const MAT_SPIKE = 8;
const MAT_HANDLE = 9;
const MAT_GRIP = 10;

export function generate3DRunnerFrames(scene, colorTheme = 'blue') {
    const isBlue = colorTheme === 'blue';
    const prefix = isBlue ? 'blue_run_' : 'red_run_';
    const frameCount = 8;
    const width = 80;
    const height = 88;

    // 3-Tone Half-Lambert Ramp Palette matching uploaded reference screenshot
    const palette3Tone = isBlue ? {
        [MAT_HEAD]: {
            high: [255, 195, 40],     // Bright warm golden-yellow highlight
            mid: [255, 150, 10],      // Vibrant mango golden-orange (#ff960a)
            shadow: [200, 85, 0]      // Rich warm amber shadow
        },
        [MAT_BODY]: {
            high: [255, 190, 35],
            mid: [255, 145, 10],
            shadow: [195, 80, 0]
        },
        [MAT_SHORTS]: {
            high: [45, 175, 250],    // Azure sky blue
            mid: [0, 135, 230],      // Rich royal blue
            shadow: [0, 80, 160]     // Deep oceanic shadow
        },
        [MAT_BELT]: {
            high: [205, 30, 30],     // Dark crimson belt
            mid: [160, 18, 22],
            shadow: [105, 10, 15]
        },
        [MAT_SASH]: {
            high: [230, 30, 65],     // Deep cherry crimson
            mid: [190, 18, 50],
            shadow: [125, 8, 32]
        },
        [MAT_SASH_TEETH]: {
            high: [255, 240, 90],    // Bright gold ammo teeth
            mid: [240, 195, 10],
            shadow: [170, 120, 0]
        },
        [MAT_MACE_HEAD]: {
            high: [45, 205, 235],    // Bright cyan highlight
            mid: [0, 150, 190],      // Peacock cyan-teal
            shadow: [0, 95, 135]     // Deep teal shadow
        },
        [MAT_SPIKE]: {
            high: [245, 50, 50],     // Fire ruby red
            mid: [210, 22, 28],
            shadow: [145, 12, 20]
        },
        [MAT_HANDLE]: {
            high: [130, 65, 18],     // Dark wood handle
            mid: [85, 38, 10],
            shadow: [50, 20, 5]
        },
        [MAT_GRIP]: {
            high: [45, 200, 240],    // Cyan grip rings
            mid: [0, 150, 200],
            shadow: [0, 100, 145]
        }
    } : {
        [MAT_HEAD]: {
            high: [255, 120, 120],
            mid: [230, 40, 40],
            shadow: [140, 15, 20]
        },
        [MAT_BODY]: {
            high: [255, 110, 110],
            mid: [220, 35, 35],
            shadow: [135, 12, 18]
        },
        [MAT_SHORTS]: {
            high: [240, 100, 100],
            mid: [195, 25, 25],
            shadow: [120, 15, 15]
        },
        [MAT_BELT]: {
            high: [245, 210, 60],
            mid: [220, 175, 20],
            shadow: [150, 100, 0]
        },
        [MAT_SASH]: {
            high: [240, 240, 245],
            mid: [200, 205, 215],
            shadow: [120, 125, 135]
        },
        [MAT_SASH_TEETH]: {
            high: [255, 220, 220],
            mid: [225, 140, 140],
            shadow: [160, 80, 80]
        },
        [MAT_MACE_HEAD]: {
            high: [245, 120, 135],
            mid: [215, 45, 65],
            shadow: [135, 12, 35]
        },
        [MAT_SPIKE]: {
            high: [255, 180, 190],
            mid: [235, 85, 105],
            shadow: [165, 20, 45]
        },
        [MAT_HANDLE]: {
            high: [210, 180, 100],
            mid: [160, 130, 40],
            shadow: [110, 80, 15]
        },
        [MAT_GRIP]: {
            high: [240, 240, 245],
            mid: [200, 205, 215],
            shadow: [120, 125, 135]
        }
    };

    // 3D Directional Sunlight from Top-Right-Front (Illuminates top-right, shades bottom-left)
    const lightDir = normalize([0.48, 0.72, 0.50]);

    const frameKeys = [];

    // Render 8 Frames using 3D Raymarching & 3-Tone Half-Lambert Ramp Shading
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
        const imgData = ctx.createImageData(width, height);
        const data = imgData.data;

        const phase = (f / frameCount) * Math.PI * 2;
        const bob = Math.abs(Math.sin(phase)) * 4.2;
        const bodyTilt = Math.sin(phase) * 0.05;

        // 3D Character Joint Kinematics in Space (X, Y, Z)
        const cx = 0;
        const pelvisPos = v3(cx, -bob, 0);
        const chestPos = v3(cx + Math.sin(bodyTilt) * 2.0, 14 - bob, -1.0);
        const headPos = v3(cx + Math.sin(bodyTilt) * 4.0, 31 - bob, -2.0);

        // Legs kinematics (high back-kick & forward plant with 3D Z-motion)
        function compute3DLeg(hipOffset, legPhase) {
            const cycle = Math.sin(legPhase);
            const hip = v3(pelvisPos[0] + hipOffset, pelvisPos[1] - 4.0, pelvisPos[2]);
            let knee, foot;

            if (cycle >= 0) {
                const t = cycle;
                const thighAngle = 0.15 - t * 0.55;
                knee = v3(
                    hip[0],
                    hip[1] - Math.cos(thighAngle) * 9.5,
                    hip[2] + Math.sin(thighAngle) * 9.5
                );
                const shinAngle = thighAngle + 0.15 + (1 - t) * 0.25;
                foot = v3(
                    knee[0],
                    knee[1] - Math.cos(shinAngle) * 9.5,
                    knee[2] + Math.sin(shinAngle) * 9.5
                );
            } else {
                const t = -cycle;
                const thighAngle = 0.15 + t * 0.65;
                knee = v3(
                    hip[0],
                    hip[1] - Math.cos(thighAngle) * 9.0,
                    hip[2] - Math.sin(thighAngle) * 8.5
                );
                const shinAngle = thighAngle - Math.PI * (0.42 + t * 0.48);
                foot = v3(
                    knee[0],
                    knee[1] - Math.cos(shinAngle) * 9.2,
                    knee[2] + Math.sin(shinAngle) * 9.2
                );
            }
            return { hip, knee, foot };
        }

        const leftLeg = compute3DLeg(-5.8, phase);
        const rightLeg = compute3DLeg(5.8, phase + Math.PI);

        // Arms kinematics (Left arm pumps naturally, Right arm holds mace upright)
        const leftArmPhase = phase;
        const leftArmSwing = Math.sin(leftArmPhase);
        const lShoulder = v3(chestPos[0] - 10.0, chestPos[1] - 2.0, chestPos[2]);
        const lElbow = v3(lShoulder[0] - 3.5, lShoulder[1] - 8.0 + leftArmSwing * 4.0, lShoulder[2] - leftArmSwing * 5.0);
        const lHand = v3(lElbow[0] + 1.5, lElbow[1] - 6.5 - leftArmSwing * 3.0, lElbow[2] + leftArmSwing * 6.0);

        // Right arm holding mace upright
        const rShoulder = v3(chestPos[0] + 10.0, chestPos[1] - 2.0, chestPos[2]);
        const rElbow = v3(rShoulder[0] + 4.5, rShoulder[1] - 8.5, rShoulder[2] - 2.0);
        const rHand = v3(rElbow[0] - 1.5, rElbow[1] + 6.0, rElbow[2] + 4.0);

        // Spiked Mace Weapon 3D Axis
        const maceHandleBottom = v3(rHand[0] + 0.5, rHand[1] - 8.0, rHand[2] - 1.0);
        const maceHeadBottom = v3(rHand[0] - 0.2, rHand[1] + 6.0, rHand[2] + 0.5);
        const maceHeadTop = v3(rHand[0] - 0.5, rHand[1] + 25.0, rHand[2] + 1.5);

        // Scene Signed Distance Function
        function sceneSDF(p) {
            let minDist = 1e5;
            let matId = MAT_BODY;

            function check(dist, mat) {
                if (dist < minDist) {
                    minDist = dist;
                    matId = mat;
                }
            }

            // 1. Head (Large 3D Sphere in Golden Mango Color)
            const dHead = sdSphere(p, headPos, 16.5);
            check(dHead, MAT_HEAD);

            // 2. Torso (3D Tapered Capsule from Pelvis to Chest in Tangerine Orange)
            const dTorso = sdCapsule(p, pelvisPos, chestPos, 9.2);
            check(dTorso, MAT_BODY);

            // 3. Sky Blue Shorts (Lower Torso Segment)
            const shortsMid = v3(pelvisPos[0], pelvisPos[1] - 2.5, pelvisPos[2]);
            const dShorts = sdCapsule(p, pelvisPos, shortsMid, 9.0);
            check(dShorts, MAT_SHORTS);

            // 4. Crimson Waistband Belt
            const beltPos = v3(pelvisPos[0], pelvisPos[1] + 1.5, pelvisPos[2]);
            const dBelt = sdCapsule(p, beltPos, v3(beltPos[0], beltPos[1] - 0.8, beltPos[2]), 9.2);
            check(dBelt, MAT_BELT);

            // 5. Left Leg (Thigh, Knee, Calf, Foot)
            const dLThigh = sdCapsule(p, leftLeg.hip, leftLeg.knee, 4.2);
            const dLCalf = sdCapsule(p, leftLeg.knee, leftLeg.foot, 3.8);
            const dLFoot = sdSphere(p, leftLeg.foot, 4.0);
            check(dLThigh, MAT_BODY);
            check(dLCalf, MAT_BODY);
            check(dLFoot, MAT_BODY);

            // 6. Right Leg (Thigh, Knee, Calf, Foot)
            const dRThigh = sdCapsule(p, rightLeg.hip, rightLeg.knee, 4.2);
            const dRCalf = sdCapsule(p, rightLeg.knee, rightLeg.foot, 3.8);
            const dRFoot = sdSphere(p, rightLeg.foot, 4.0);
            check(dRThigh, MAT_BODY);
            check(dRCalf, MAT_BODY);
            check(dRFoot, MAT_BODY);

            // 7. Left Arm (Upper Arm, Forearm, Hand)
            const dLUpper = sdCapsule(p, lShoulder, lElbow, 3.5);
            const dLFore = sdCapsule(p, lElbow, lHand, 3.0);
            const dLHand = sdSphere(p, lHand, 3.4);
            check(dLUpper, MAT_BODY);
            check(dLFore, MAT_BODY);
            check(dLHand, MAT_BODY);

            // 8. Right Arm (Upper Arm, Forearm, Hand)
            const dRUpper = sdCapsule(p, rShoulder, rElbow, 3.5);
            const dRFore = sdCapsule(p, rElbow, rHand, 3.0);
            const dRHand = sdSphere(p, rHand, 3.4);
            check(dRUpper, MAT_BODY);
            check(dRFore, MAT_BODY);
            check(dRHand, MAT_BODY);

            // 9. Diagonal Crimson Ammo Bandolier
            const sashStart = v3(chestPos[0] - 6.5, chestPos[1] + 2.0, chestPos[2] - 5.5);
            const sashEnd = v3(pelvisPos[0] + 6.0, pelvisPos[1] + 1.0, pelvisPos[2] - 5.5);
            const dSash = sdCapsule(p, sashStart, sashEnd, 3.2);
            check(dSash, MAT_SASH);

            // 10. Spiked Mace Weapon (Handle, Cyan Head, Spikes, Studs)
            const dHandle = sdCapsule(p, maceHandleBottom, maceHeadBottom, 2.4);
            check(dHandle, MAT_HANDLE);

            const dMaceHead = sdCapsule(p, maceHeadBottom, maceHeadTop, 5.8);
            check(dMaceHead, MAT_MACE_HEAD);

            const spikeRadius = 5.6;
            const spikeAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5, Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
            const maceCenter = v3((maceHeadBottom[0] + maceHeadTop[0]) * 0.5, (maceHeadBottom[1] + maceHeadTop[1]) * 0.5, (maceHeadBottom[2] + maceHeadTop[2]) * 0.5);

            for (let i = 0; i < 4; i++) {
                const ang = spikeAngles[i];
                const spkTip = v3(
                    maceCenter[0] + Math.cos(ang) * (spikeRadius + 4.5),
                    maceCenter[1] + (i % 2 === 0 ? 3.0 : -3.0),
                    maceCenter[2] + Math.sin(ang) * (spikeRadius + 4.5)
                );
                const spkBase = v3(
                    maceCenter[0] + Math.cos(ang) * spikeRadius,
                    maceCenter[1] + (i % 2 === 0 ? 3.0 : -3.0),
                    maceCenter[2] + Math.sin(ang) * spikeRadius
                );
                const dSpike = sdCapsule(p, spkBase, spkTip, 1.4);
                check(dSpike, MAT_SPIKE);
            }

            const dTopSpike = sdCapsule(p, maceHeadTop, v3(maceHeadTop[0], maceHeadTop[1] + 5.0, maceHeadTop[2]), 1.4);
            check(dTopSpike, MAT_SPIKE);

            return [minDist, matId];
        }

        // Raymarching Renderer over 2D Pixel Grid
        const halfW = width / 2;
        const originY = 56;

        for (let py = 0; py < height; py++) {
            const spaceY = originY - py;

            for (let px = 0; px < width; px++) {
                const spaceX = px - halfW;
                const pIdx = (py * width + px) * 4;

                let rayZ = 35.0;
                let hit = false;
                let hitMat = MAT_BODY;

                for (let step = 0; step < 26; step++) {
                    const pos = v3(spaceX, spaceY, rayZ);
                    const [dist, mat] = sceneSDF(pos);

                    if (dist < 0.25) {
                        hit = true;
                        hitMat = mat;
                        break;
                    }
                    rayZ -= Math.max(0.35, dist * 0.7);
                    if (rayZ < -35.0) break;
                }

                if (hit) {
                    const hitPos = v3(spaceX, spaceY, rayZ);

                    // Surface Normal via Finite Differences
                    const eps = 0.35;
                    const d0 = sceneSDF(hitPos)[0];
                    const nx = sceneSDF(v3(hitPos[0] + eps, hitPos[1], hitPos[2]))[0] - d0;
                    const ny = sceneSDF(v3(hitPos[0], hitPos[1] + eps, hitPos[2]))[0] - d0;
                    const nz = sceneSDF(v3(hitPos[0], hitPos[1], hitPos[2] + eps))[0] - d0;
                    const normal = normalize([nx, ny, nz]);

                    // Direct 3D Diffuse Shading with rich volumetric contrast
                    const nDotL = dot(normal, lightDir);

                    // Ambient Occlusion in crevices & under limbs
                    const aoSample = sceneSDF(add(hitPos, mul(normal, 3.2)))[0];
                    const ao = clamp(aoSample / 3.0, 0.25, 1.0);

                    const effectiveLight = nDotL * ao;
                    const mat = palette3Tone[hitMat] || palette3Tone[MAT_BODY];

                    let r, g, b;
                    if (effectiveLight > 0.38) {
                        // Top-Right Sunlit Highlight zone
                        const t = clamp((effectiveLight - 0.38) / 0.55, 0.0, 1.0);
                        r = mat.mid[0] + (mat.high[0] - mat.mid[0]) * t;
                        g = mat.mid[1] + (mat.high[1] - mat.mid[1]) * t;
                        b = mat.mid[2] + (mat.high[2] - mat.mid[2]) * t;
                    } else if (effectiveLight > -0.22) {
                        // Midtone zone (saturated rich body color)
                        const t = clamp((effectiveLight - (-0.22)) / 0.60, 0.0, 1.0);
                        r = mat.shadow[0] + (mat.mid[0] - mat.shadow[0]) * t;
                        g = mat.shadow[1] + (mat.mid[1] - mat.shadow[1]) * t;
                        b = mat.shadow[2] + (mat.mid[2] - mat.shadow[2]) * t;
                    } else {
                        // Bottom-Left & Underside Warm Shadow zone
                        const shadowFactor = clamp((effectiveLight - (-1.0)) / 0.78, 0.85, 1.0);
                        r = mat.shadow[0] * shadowFactor;
                        g = mat.shadow[1] * shadowFactor;
                        b = mat.shadow[2] * shadowFactor;
                    }

                    // Tight subtle specular sheen on top-right curvature
                    const viewDir = v3(0, 0, 1);
                    const halfVec = normalize(add(lightDir, viewDir));
                    const nDotH = Math.max(0.0, dot(normal, halfVec));
                    const specular = Math.pow(nDotH, 20.0) * 0.22;

                    r = clamp(r + specular * mat.high[0] * 0.4, 0, 255);
                    g = clamp(g + specular * mat.high[1] * 0.4, 0, 255);
                    b = clamp(b + specular * mat.high[2] * 0.4, 0, 255);

                    data[pIdx] = Math.round(r);
                    data[pIdx + 1] = Math.round(g);
                    data[pIdx + 2] = Math.round(b);
                    data[pIdx + 3] = 255;
                } else {
                    // Soft Ground Contact Shadow (offset towards bottom-left due to top-right sunlight)
                    const shadowY = originY + 24;
                    const dy = (py - shadowY) * 2.6;
                    const dx = spaceX + 3.2;
                    const distSq = dx * dx + dy * dy;
                    const shadowRadius = 18.0 - bob * 0.5;

                    if (distSq < shadowRadius * shadowRadius) {
                        const alpha = (1.0 - Math.sqrt(distSq) / shadowRadius) * 0.38;
                        data[pIdx] = 0;
                        data[pIdx + 1] = 0;
                        data[pIdx + 2] = 0;
                        data[pIdx + 3] = Math.round(alpha * 255);
                    }
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
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
