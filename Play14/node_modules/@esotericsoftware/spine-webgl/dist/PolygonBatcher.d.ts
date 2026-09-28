/******************************************************************************
 * Spine Runtimes License Agreement
 * Last updated April 5, 2025. Replaces all prior versions.
 *
 * Copyright (c) 2013-2025, Esoteric Software LLC
 *
 * Integration of the Spine Runtimes into software or otherwise creating
 * derivative works of the Spine Runtimes is permitted under the terms and
 * conditions of Section 2 of the Spine Editor License Agreement:
 * http://esotericsoftware.com/spine-editor-license
 *
 * Otherwise, it is permitted to integrate the Spine Runtimes into software
 * or otherwise create derivative works of the Spine Runtimes (collectively,
 * "Products"), provided that each user of the Products must obtain their own
 * Spine Editor license and redistribution of the Products in any form must
 * include this license and copyright notice.
 *
 * THE SPINE RUNTIMES ARE PROVIDED BY ESOTERIC SOFTWARE LLC "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL ESOTERIC SOFTWARE LLC BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES,
 * BUSINESS INTERRUPTION, OR LOSS OF USE, DATA, OR PROFITS) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THE SPINE RUNTIMES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *****************************************************************************/
import { BlendMode, Disposable } from "@esotericsoftware/spine-core";
import { GLTexture } from "./GLTexture.js";
import { Shader } from "./Shader.js";
import { ManagedWebGLRenderingContext } from "./WebGL.js";
export declare class PolygonBatcher implements Disposable {
    static disableCulling: boolean;
    private context;
    private drawCalls;
    private static globalDrawCalls;
    isDrawing: boolean;
    private mesh;
    private shader;
    private lastTexture;
    private verticesLength;
    private indicesLength;
    private srcColorBlend;
    private srcAlphaBlend;
    private dstBlend;
    private cullWasEnabled;
    constructor(context: ManagedWebGLRenderingContext | WebGLRenderingContext, twoColorTint?: boolean, maxVertices?: number);
    begin(shader: Shader): void;
    private static blendModesGL;
    setBlendMode(blendMode: BlendMode, premultipliedAlpha: boolean): void;
    draw(texture: GLTexture, vertices: ArrayLike<number>, indices: Array<number>): void;
    flush(): void;
    end(): void;
    getDrawCalls(): number;
    static getAndResetGlobalDrawCalls(): number;
    dispose(): void;
}
