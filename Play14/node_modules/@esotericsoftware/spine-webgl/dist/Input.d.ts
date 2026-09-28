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
import { Disposable } from "./index.js";
export declare class Input implements Disposable {
    element: HTMLElement;
    mouseX: number;
    mouseY: number;
    buttonDown: boolean;
    touch0: Touch | null;
    touch1: Touch | null;
    initialPinchDistance: number;
    private listeners;
    private autoPreventDefault;
    private isTouch;
    private callbacks;
    constructor(element: HTMLElement, autoPreventDefault?: boolean);
    private setupCallbacks;
    dispose(): void;
    addListener(listener: InputListener): void;
    removeListener(listener: InputListener): void;
}
export declare class Touch {
    identifier: number;
    x: number;
    y: number;
    constructor(identifier: number, x: number, y: number);
}
export interface InputListener {
    down?(x: number, y: number, ev?: MouseEvent | TouchEvent): void;
    up?(x: number, y: number, ev?: MouseEvent | TouchEvent): void;
    moved?(x: number, y: number, ev?: MouseEvent | TouchEvent): void;
    dragged?(x: number, y: number, ev?: MouseEvent | TouchEvent): void;
    wheel?(delta: number, ev?: MouseEvent | TouchEvent): void;
    zoom?(initialDistance: number, distance: number, ev?: MouseEvent | TouchEvent): void;
}
