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
import { CanvasTexture, SkeletonRenderer } from "@esotericsoftware/spine-canvas";
import { AtlasAttachmentLoader, GLTexture, SceneRenderer, Skeleton, SkeletonBinary, SkeletonJson, TextureAtlas } from "@esotericsoftware/spine-webgl";
import * as Phaser from "phaser";
import { SPINE_ATLAS_CACHE_KEY, SPINE_ATLAS_FILE_TYPE, SPINE_GAME_OBJECT_TYPE, SPINE_SKELETON_FILE_CACHE_KEY as SPINE_SKELETON_DATA_CACHE_KEY, SPINE_SKELETON_DATA_FILE_TYPE } from "./keys.js";
import { SpineGameObject } from "./SpineGameObject.js";
Skeleton.yDown = true;
/**
 * {@link ScenePlugin} implementation adding Spine Runtime capabilities to a scene.
 *
 * The scene's {@link LoaderPlugin} (`Scene.load`) gets these additional functions:
 * * `spineBinary(key: string, url: string, xhrSettings?: XHRSettingsObject)`: loads a skeleton binary `.skel` file from the `url`.
 * * `spineJson(key: string, url: string, xhrSettings?: XHRSettingsObject)`: loads a skeleton binary `.skel` file from the `url`.
 * * `spineAtlas(key: string, url: string, premultipliedAlpha: boolean = true, xhrSettings?: XHRSettingsObject)`: loads a texture atlas `.atlas` file from the `url` as well as its correponding texture atlas page images.
 *
 * The scene's {@link GameObjectFactory} (`Scene.add`) gets these additional functions:
 * * `spine(x: number, y: number, dataKey: string, atlasKey: string, boundsProvider: SpineGameObjectBoundsProvider = SetupPoseBoundsProvider())`:
 *    creates a new {@link SpineGameObject} from the data and atlas at position `(x, y)`, using the {@link BoundsProvider} to calculate its bounding box. The object is automatically added to the scene.
 *
 * The scene's {@link GameObjectCreator} (`Scene.make`) gets these additional functions:
 * * `spine(config: SpineGameObjectConfig)`: creates a new {@link SpineGameObject} from the given configuration object.
 *
 * The plugin has additional public methods to work with Spine Runtime core API objects:
 * * `getAtlas(atlasKey: string)`: returns the {@link TextureAtlas} instance for the given atlas key.
 * * `getSkeletonData(skeletonDataKey: string)`: returns the {@link SkeletonData} instance for the given skeleton data key.
 * * `createSkeleton(skeletonDataKey: string, atlasKey: string, premultipliedAlpha: boolean = true)`: creates a new {@link Skeleton} instance from the given skeleton data and atlas key.
 * * `isPremultipliedAlpha(atlasKey: string)`: returns `true` if the atlas with the given key has premultiplied alpha.
 */
export class SpinePlugin extends Phaser.Plugins.ScenePlugin {
    game;
    isWebGL;
    gl;
    gameWebGLRenderer = null;
    get webGLRenderer() {
        return this.gameWebGLRenderer;
    }
    canvasRenderer;
    phaserRenderer;
    skeletonDataCache;
    atlasCache;
    constructor(scene, pluginManager, pluginKey) {
        super(scene, pluginManager, pluginKey);
        this.game = pluginManager.game;
        this.isWebGL = this.game.config.renderType === 2;
        this.gl = this.isWebGL ? this.game.renderer.gl : null;
        this.phaserRenderer = this.game.renderer;
        this.canvasRenderer = null;
        this.skeletonDataCache = this.game.cache.addCustom(SPINE_SKELETON_DATA_CACHE_KEY);
        this.atlasCache = this.game.cache.addCustom(SPINE_ATLAS_CACHE_KEY);
        let skeletonJsonFileCallback = function (key, url, xhrSettings) {
            let file = new SpineSkeletonDataFile(this, key, url, SpineSkeletonDataFileType.json, xhrSettings);
            this.addFile(file.files);
            return this;
        };
        pluginManager.registerFileType("spineJson", skeletonJsonFileCallback, scene);
        let skeletonBinaryFileCallback = function (key, url, xhrSettings) {
            let file = new SpineSkeletonDataFile(this, key, url, SpineSkeletonDataFileType.binary, xhrSettings);
            this.addFile(file.files);
            return this;
        };
        pluginManager.registerFileType("spineBinary", skeletonBinaryFileCallback, scene);
        let atlasFileCallback = function (key, url, premultipliedAlpha, xhrSettings) {
            let file = new SpineAtlasFile(this, key, url, premultipliedAlpha, xhrSettings);
            this.addFile(file.files);
            return this;
        };
        pluginManager.registerFileType("spineAtlas", atlasFileCallback, scene);
        let addSpineGameObject = function (x, y, dataKey, atlasKey, boundsProvider) {
            const spinePlugin = this.scene.sys[pluginKey];
            let gameObject = new SpineGameObject(this.scene, spinePlugin, x, y, dataKey, atlasKey, boundsProvider);
            this.displayList.add(gameObject);
            this.updateList.add(gameObject);
            return gameObject;
        };
        let makeSpineGameObject = function (config, addToScene = false) {
            let x = config.x ? config.x : 0;
            let y = config.y ? config.y : 0;
            let boundsProvider = config.boundsProvider ? config.boundsProvider : undefined;
            const spinePlugin = this.scene.sys[pluginKey];
            let gameObject = new SpineGameObject(this.scene, spinePlugin, x, y, config.dataKey, config.atlasKey, boundsProvider);
            if (addToScene !== undefined) {
                config.add = addToScene;
            }
            return Phaser.GameObjects.BuildGameObject(this.scene, gameObject, config);
        };
        pluginManager.registerGameObject(window.SPINE_GAME_OBJECT_TYPE ? window.SPINE_GAME_OBJECT_TYPE : SPINE_GAME_OBJECT_TYPE, addSpineGameObject, makeSpineGameObject);
    }
    static rendererId = 0;
    boot() {
        if (this.isWebGL && this.gl) {
            this.gameWebGLRenderer ||= new SceneRenderer(this.game.renderer.canvas, this.gl, true);
        }
        else if (this.scene) {
            this.canvasRenderer ||= new SkeletonRenderer(this.scene.sys.context);
        }
        this.onResize();
        if (this.systems) {
            this.systems.events.once("destroy", this.destroy, this);
            this.systems.events.on("start", this.onStart, this);
            this.systems.events.on("shutdown", this.shutdown, this);
        }
        this.game.events.once("destroy", this.gameDestroy, this);
    }
    onResize() {
        const phaserRenderer = this.game.renderer;
        const sceneRenderer = this.webGLRenderer;
        if (phaserRenderer && sceneRenderer) {
            const viewportWidth = phaserRenderer.width;
            const viewportHeight = phaserRenderer.height;
            sceneRenderer.camera.position.x = viewportWidth / 2;
            sceneRenderer.camera.position.y = viewportHeight / 2;
            sceneRenderer.camera.up.y = -1;
            sceneRenderer.camera.direction.z = 1;
            sceneRenderer.camera.setViewport(viewportWidth, viewportHeight);
        }
    }
    onStart() {
        this.game.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    }
    shutdown() {
        if (this.isWebGL) {
            this.game.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
        }
    }
    destroy() {
        this.shutdown();
        this.systems?.events.off("start", this.onStart, this);
        this.systems?.events.off("shutdown", this.shutdown, this);
    }
    gameDestroy() {
        this.pluginManager.removeGameObject(window.SPINE_GAME_OBJECT_TYPE ? window.SPINE_GAME_OBJECT_TYPE : SPINE_GAME_OBJECT_TYPE, true, true);
        if (this.webGLRenderer)
            this.webGLRenderer.dispose();
        this.gameWebGLRenderer = null;
    }
    /** Returns the TextureAtlas instance for the given key */
    getAtlas(atlasKey) {
        let atlas;
        if (this.atlasCache.exists(atlasKey)) {
            atlas = this.atlasCache.get(atlasKey);
        }
        else {
            let atlasFile = this.game.cache.text.get(atlasKey);
            atlas = new TextureAtlas(atlasFile.data);
            if (this.isWebGL) {
                let gl = this.gl;
                const phaserUnpackPmaValue = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
                if (phaserUnpackPmaValue)
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                for (let atlasPage of atlas.pages) {
                    atlasPage.setTexture(new GLTexture(gl, this.game.textures.get(atlasKey + "!" + atlasPage.name).getSourceImage(), false));
                }
                if (phaserUnpackPmaValue)
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            }
            else {
                for (let atlasPage of atlas.pages) {
                    atlasPage.setTexture(new CanvasTexture(this.game.textures.get(atlasKey + "!" + atlasPage.name).getSourceImage()));
                }
            }
            this.atlasCache.add(atlasKey, atlas);
        }
        return atlas;
    }
    /** Returns whether the TextureAtlas uses premultiplied alpha */
    isAtlasPremultiplied(atlasKey) {
        let atlasFile = this.game.cache.text.get(atlasKey);
        if (!atlasFile)
            return false;
        return atlasFile.premultipliedAlpha;
    }
    /** Returns the SkeletonData instance for the given data and atlas key */
    getSkeletonData(dataKey, atlasKey) {
        const atlas = this.getAtlas(atlasKey);
        const combinedKey = dataKey + atlasKey;
        let skeletonData;
        if (this.skeletonDataCache.exists(combinedKey)) {
            skeletonData = this.skeletonDataCache.get(combinedKey);
        }
        else {
            if (this.game.cache.json.exists(dataKey)) {
                let jsonFile = this.game.cache.json.get(dataKey);
                let json = new SkeletonJson(new AtlasAttachmentLoader(atlas));
                skeletonData = json.readSkeletonData(jsonFile);
            }
            else {
                let binaryFile = this.game.cache.binary.get(dataKey);
                let binary = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
                skeletonData = binary.readSkeletonData(new Uint8Array(binaryFile));
            }
            this.skeletonDataCache.add(combinedKey, skeletonData);
        }
        return skeletonData;
    }
    /** Creates a new Skeleton instance from the data and atlas. */
    createSkeleton(dataKey, atlasKey) {
        if (this.isWebGL) {
            const renderer = this.phaserRenderer;
            renderer.glWrapper.updateTexturingFlipY({ texturing: { flipY: false } });
            renderer.renderNodes.getNode("YieldContext")?.run();
        }
        const skeleton = new Skeleton(this.getSkeletonData(dataKey, atlasKey));
        if (this.isWebGL) {
            const renderer = this.phaserRenderer;
            renderer.renderNodes.getNode("RebindContext")?.run();
        }
        return skeleton;
    }
}
var SpineSkeletonDataFileType;
(function (SpineSkeletonDataFileType) {
    SpineSkeletonDataFileType[SpineSkeletonDataFileType["json"] = 0] = "json";
    SpineSkeletonDataFileType[SpineSkeletonDataFileType["binary"] = 1] = "binary";
})(SpineSkeletonDataFileType || (SpineSkeletonDataFileType = {}));
class SpineSkeletonDataFile extends Phaser.Loader.MultiFile {
    fileType;
    constructor(loader, key, url, fileType, xhrSettings) {
        if (typeof key !== "string") {
            const config = key;
            key = config.key;
            url = config.url;
            fileType = config.type === "spineJson" ? SpineSkeletonDataFileType.json : SpineSkeletonDataFileType.binary;
            xhrSettings = config.xhrSettings;
        }
        let file = null;
        let isJson = fileType == SpineSkeletonDataFileType.json;
        if (isJson) {
            file = new Phaser.Loader.FileTypes.JSONFile(loader, {
                key: key,
                url: url,
                extension: "json",
                xhrSettings: xhrSettings,
            });
        }
        else {
            file = new Phaser.Loader.FileTypes.BinaryFile(loader, {
                key: key,
                url: url,
                extension: "skel",
                xhrSettings: xhrSettings,
            });
        }
        super(loader, SPINE_SKELETON_DATA_FILE_TYPE, key, [file]);
        this.fileType = fileType;
    }
    onFileComplete(file) {
        this.pending--;
    }
    addToCache() {
        if (this.isReadyToProcess())
            this.files[0].addToCache();
    }
}
class SpineAtlasFile extends Phaser.Loader.MultiFile {
    premultipliedAlpha;
    constructor(loader, key, url, premultipliedAlpha, xhrSettings) {
        if (typeof key !== "string") {
            const config = key;
            key = config.key;
            url = config.url;
            premultipliedAlpha = config.premultipliedAlpha;
            xhrSettings = config.xhrSettings;
        }
        super(loader, SPINE_ATLAS_FILE_TYPE, key, [
            new Phaser.Loader.FileTypes.TextFile(loader, {
                key: key,
                url: url,
                xhrSettings: xhrSettings,
                extension: "atlas"
            })
        ]);
        this.premultipliedAlpha = premultipliedAlpha;
    }
    onFileComplete(file) {
        if (this.files.indexOf(file) != -1) {
            this.pending--;
            if (file.type == "text") {
                var lines = file.data.split(/\r\n|\r|\n/);
                let textures = [];
                textures.push(lines[0]);
                for (var t = 1; t < lines.length; t++) {
                    var line = lines[t];
                    if (line.trim() === '' && t < lines.length - 1) {
                        line = lines[t + 1];
                        textures.push(line);
                    }
                }
                let fileUrl = file.url;
                if (typeof fileUrl === "object")
                    fileUrl = file.src;
                let basePath = (fileUrl.match(/^.*\//) ?? "").toString();
                if (this.loader.path && this.loader.path.length > 0 && basePath.startsWith(this.loader.path))
                    basePath = basePath.slice(this.loader.path.length);
                for (var i = 0; i < textures.length; i++) {
                    var url = basePath + textures[i];
                    var key = file.key + "!" + textures[i];
                    var image = new Phaser.Loader.FileTypes.ImageFile(this.loader, key, url);
                    if (!this.loader.keyExists(image)) {
                        this.addToMultiFile(image);
                        this.loader.addFile(image);
                    }
                }
            }
        }
    }
    addToCache() {
        if (this.isReadyToProcess()) {
            let textureManager = this.loader.textureManager;
            for (let file of this.files) {
                if (file.type == "image") {
                    if (!textureManager.exists(file.key)) {
                        textureManager.addImage(file.key, file.data);
                    }
                }
                else {
                    this.premultipliedAlpha = this.premultipliedAlpha ?? (file.data.indexOf("pma: true") >= 0 || file.data.indexOf("pma:true") >= 0);
                    file.data = {
                        data: file.data,
                        premultipliedAlpha: this.premultipliedAlpha,
                    };
                    file.addToCache();
                }
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3BpbmVQbHVnaW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvU3BpbmVQbHVnaW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsrRUEyQitFO0FBRS9FLE9BQU8sRUFBRSxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFnQixZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUE7QUFDbkssT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLHNCQUFzQixFQUFFLDZCQUE2QixJQUFJLDZCQUE2QixFQUFFLDZCQUE2QixFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ2hNLE9BQU8sRUFBRSxlQUFlLEVBQWlDLE1BQU0sc0JBQXNCLENBQUM7QUFFdEYsUUFBUSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7QUFtQnRCOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW9CRztBQUNILE1BQU0sT0FBTyxXQUFZLFNBQVEsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO0lBQzFELElBQUksQ0FBYztJQUNWLE9BQU8sQ0FBVTtJQUN6QixFQUFFLENBQStCO0lBQ2pDLGlCQUFpQixHQUF5QixJQUFJLENBQUM7SUFDL0MsSUFBSSxhQUFhO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDO0lBQy9CLENBQUM7SUFDRCxjQUFjLENBQTBCO0lBQ3hDLGNBQWMsQ0FBOEU7SUFDcEYsaUJBQWlCLENBQXlCO0lBQzFDLFVBQVUsQ0FBeUI7SUFFM0MsWUFBYSxLQUFtQixFQUFFLGFBQTJDLEVBQUUsU0FBaUI7UUFDL0YsS0FBSyxDQUFDLEtBQUssRUFBRSxhQUFhLEVBQUUsU0FBUyxD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Q3RDLGNBQWMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQzlDLENBQUM7Z0JBQ0YsQ0FBQztxQkFBTSxDQUFDO29CQUNQLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsa0JBQWtCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2pJLElBQUksQ0FBQyxJQUFJLEdBQUc7d0JBQ1gsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO3dCQUNmLGtCQUFrQixFQUFFLElBQUksQ0FBQyxrQkFBa0I7cUJBQzNDLENBQUM7b0JBQ0YsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNuQixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gKiBTcGluZSBSdW50aW1lcyBMaWNlbnNlIEFncmVlbWVudFxuICogTGFzdCB1cGRhdGVkIEFwcmlsIDUsIDIwMjUuIFJlcGxhY2VzIGFsbCBwcmlvciB2ZXJzaW9ucy5cbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMtMjAyNSwgRXNvdGVyaWMgU29mdHdhcmUgTExDXG4gKlxuICogSW50ZWdyYXRpb24gb2YgdGhlIFNwaW5lIFJ1bnRpbWVzIGludG8gc29mdHdhcmUgb3Igb3RoZXJ3aXNlIGNyZWF0aW5nXG4gKiBkZXJpdmF0aXZlIHdvcmtzIG9mIHRoZSBTcGluZSBSdW50aW1lcyBpcyBwZXJtaXR0ZWQgdW5kZXIgdGhlIHRlcm1zIGFuZFxuICogY29uZGl0aW9ucyBvZiBTZWN0aW9uIDIgb2YgdGhlIFNwaW5lIEVkaXRvciBMaWNlbnNlIEFncmVlbWVudDpcbiAqIGh0dHA6Ly9lc290ZXJpY3NvZnR3YXJlLmNvbS9zcGluZS1lZGl0b3ItbGljZW5zZVxuICpcbiAqIE90aGVyd2lzZSwgaXQgaXMgcGVybWl0dGVkIHRvIGludGVncmF0ZSB0aGUgU3BpbmUgUnVudGltZXMgaW50byBzb2Z0d2FyZVxuICogb3Igb3RoZXJ3aXNlIGNyZWF0ZSBkZXJpdmF0aXZlIHdvcmtzIG9mIHRoZSBTcGluZSBSdW50aW1lcyAoY29sbGVjdGl2ZWx5LFxuICogXCJQcm9kdWN0c1wiKSwgcHJvdmlkZWQgdGhhdCBlYWNoIHVzZXIgb2YgdGhlIFByb2R1Y3RzIG11c3Qgb2J0YWluIHRoZWlyIG93blxuICogU3BpbmUgRWRpdG9yIGxpY2Vuc2UgYW5kIHJlZGlzdHJpYnV0aW9uIG9mIHRoZSBQcm9kdWN0cyBpbiBhbnkgZm9ybSBtdXN0XG4gKiBpbmNsdWRlIHRoaXMgbGljZW5zZSBhbmQgY29weXJpZ2h0IG5vdGljZS5cbiAqXG4gKiBUSEUgU1BJTkUgUlVOVElNRVMgQVJFIFBST1ZJREVEIEJZIEVTT1RFUklDIFNPRlRXQVJFIExMQyBcIkFTIElTXCIgQU5EIEFOWVxuICogRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgRVNPVEVSSUMgU09GVFdBUkUgTExDIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTLFxuICogQlVTSU5FU1MgSU5URVJSVVBUSU9OLCBPUiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUykgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GXG4gKiBUSEUgU1BJTkUgUlVOVElNRVMsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbmltcG9ydCB7IENhbnZhc1RleHR1cmUsIFNrZWxldG9uUmVuZGVyZXIgfSBmcm9tIFwiQGVzb3Rlcmljc29mdHdhcmUvc3BpbmUtY2FudmFzXCI7XG5pbXBvcnQgeyBBdGxhc0F0dGFjaG1lbnRMb2FkZXIsIEdMVGV4dHVyZSwgU2NlbmVSZW5kZXJlciwgU2tlbGV0b24sIFNrZWxldG9uQmluYXJ5LCBTa2VsZXRvbkRhdGEsIFNrZWxldG9uSnNvbiwgVGV4dHVyZUF0bGFzIH0gZnJvbSBcIkBlc290ZXJpY3NvZnR3YXJlL3NwaW5lLXdlYmdsXCJcbmltcG9ydCAqIGFzIFBoYXNlciBmcm9tIFwicGhhc2VyXCI7XG5pbXBvcnQgeyBTUElORV9BVExBU19DQUNIRV9LRVksIFNQSU5FX0FUTEFTX0ZJTEVfVFlQRSwgU1BJTkVfR0FNRV9PQkpFQ1RfVFlQRSwgU1BJTkVfU0tFTEVUT05fRklMRV9DQUNIRV9LRVkgYXMgU1BJTkVfU0tFTEVUT05fREFUQV9DQUNIRV9LRVksIFNQSU5FX1NLRUxFVE9OX0RBVEFfRklMRV9UWVBFIH0gZnJvbSBcIi4va2V5cy5qc1wiO1xuaW1wb3J0IHsgU3BpbmVHYW1lT2JqZWN0LCBTcGluZUdhbWVPYmplY3RCb3VuZHNQcm92aWRlciB9IGZyb20gXCIuL1NwaW5lR2FtZU9iamVjdC5qc1wiO1xuXG5Ta2VsZXRvbi55RG93biA9IHRydWU7XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvYmplY3QgdXNlZCB3aGVuIGNyZWF0aW5nIHtAbGluayBTcGluZUdhbWVPYmplY3R9IGluc3RhbmNlcyB2aWEgYSBzY2VuZSdzXG4gKiB7QGxpbmsgR2FtZU9iamVjdENyZWF0b3J9IChgU2NlbmUubWFrZWApLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNwaW5lR2FtZU9iamVjdENvbmZpZyBleHRlbmRzIFBoYXNlci5UeXBlcy5HYW1lT2JqZWN0cy5HYW1lT2JqZWN0Q29uZmlnIHtcblx0LyoqIFRoZSB4LXBvc2l0aW9uIG9mIHRoZSBvYmplY3QsIG9wdGlvbmFsLCBkZWZhdWx0OiAwICovXG5cdHg/OiBudW1iZXIsXG5cdC8qKiBUaGUgeS1wb3NpdGlvbiBvZiB0aGUgb2JqZWN0LCBvcHRpb25hbCwgZGVmYXVsdDogMCAqL1xuXHR5PzogbnVtYmVyLFxuXHQvKiogVGhlIHNrZWxldG9uIGRhdGEga2V5ICovXG5cdGRhdGFLZXk6IHN0cmluZyxcblx0LyoqIFRoZSBhdGxhcyBrZXkgKi9cblx0YXRsYXNLZXk6IHN0cmluZ1xuXHQvKiogVGhlIGJvdW5kcyBwcm92aWRlciwgb3B0aW9uYWwsIGRlZmF1bHQ6IGBTZXR1cFBvc2VCb3VuZHNQcm92aWRlcmAgKi9cblx0Ym91bmRzUHJvdmlkZXI/OiBTcGluZUdhbWVPYmplY3RCb3VuZHNQcm92aWRlclxufVxuXG4vKipcbiAqIHtAbGluayBTY2VuZVBsdWdpbn0gaW1wbGVtZW50YXRpb24gYWRkaW5nIFNwaW5lIFJ1bnRpbWUgY2FwYWJpbGl0aWVzIHRvIGEgc2NlbmUuXG4gKlxuICogVGhlIHNjZW5lJ3Mge0BsaW5rIExvYWRlclBsdWdpbn0gKGBTY2VuZS5sb2FkYCkgZ2V0cyB0aGVzZSBhZGRpdGlvbmFsIGZ1bmN0aW9uczpcbiAqICogYHNwaW5lQmluYXJ5KGtleTogc3RyaW5nLCB1cmw6IHN0cmluZywgeGhyU2V0dGluZ3M/OiBYSFJTZXR0aW5nc09iamVjdClgOiBsb2FkcyBhIHNrZWxldG9uIGJpbmFyeSBgLnNrZWxgIGZpbGUgZnJvbSB0aGUgYHVybGAuXG4gKiAqIGBzcGluZUpzb24oa2V5OiBzdHJpbmcsIHVybDogc3RyaW5nLCB4aHJTZXR0aW5ncz86IFhIUlNldHRpbmdzT2JqZWN0KWA6IGxvYWRzIGEgc2tlbGV0b24gYmluYXJ5IGAuc2tlbGAgZmlsZSBmcm9tIHRoZSBgdXJsYC5cbiAqICogYHNwaW5lQXRsYXMoa2V5OiBzdHJpbmcsIHVybDogc3RyaW5nLCBwcmVtdWx0aXBsaWVkQWxwaGE6IGJvb2xlYW4gPSB0cnVlLCB4aHJTZXR0aW5ncz86IFhIUlNldHRpbmdzT2JqZWN0KWA6IGxvYWRzIGEgdGV4dHVyZSBhdGxhcyBgLmF0bGFzYCBmaWxlIGZyb20gdGhlIGB1cmxgIGFzIHdlbGwgYXMgaXRzIGNvcnJlcG9uZGluZyB0ZXh0dXJlIGF0bGFzIHBhZ2UgaW1hZ2VzLlxuICpcbiAqIFRoZSBzY2VuZSdzIHtAbGluayBHYW1lT2JqZWN0RmFjdG9yeX0gKGBTY2VuZS5hZGRgKSBnZXRzIHRoZXNlIGFkZGl0aW9uYWwgZnVuY3Rpb25zOlxuICogKiBgc3BpbmUoeDogbnVtYmVyLCB5OiBudW1iZXIsIGRhdGFLZXk6IHN0cmluZywgYXRsYXNLZXk6IHN0cmluZywgYm91bmRzUHJvdmlkZXI6IFNwaW5lR2FtZU9iamVjdEJvdW5kc1Byb3ZpZGVyID0gU2V0dXBQb3NlQm91bmRzUHJvdmlkZXIoKSlgOlxuICogICAgY3JlYXRlcyBhIG5ldyB7QGxpbmsgU3BpbmVHYW1lT2JqZWN0fSBmcm9tIHRoZSBkYXRhIGFuZCBhdGxhcyBhdCBwb3NpdGlvbiBgKHgsIHkpYCwgdXNpbmcgdGhlIHtAbGluayBCb3VuZHNQcm92aWRlcn0gdG8gY2FsY3VsYXRlIGl0cyBib3VuZGluZyBib3guIFRoZSBvYmplY3QgaXMgYXV0b21hdGljYWxseSBhZGRlZCB0byB0aGUgc2NlbmUuXG4gKlxuICogVGhlIHNjZW5lJ3Mge0BsaW5rIEdhbWVPYmplY3RDcmVhdG9yfSAoYFNjZW5lLm1ha2VgKSBnZXRzIHRoZXNlIGFkZGl0aW9uYWwgZnVuY3Rpb25zOlxuICogKiBgc3BpbmUoY29uZmlnOiBTcGluZUdhbWVPYmplY3RDb25maWcpYDogY3JlYXRlcyBhIG5ldyB7QGxpbmsgU3BpbmVHYW1lT2JqZWN0fSBmcm9tIHRoZSBnaXZlbiBjb25maWd1cmF0aW9uIG9iamVjdC5cbiAqXG4gKiBUaGUgcGx1Z2luIGhhcyBhZGRpdGlvbmFsIHB1YmxpYyBtZXRob2RzIHRvIHdvcmsgd2l0aCBTcGluZSBSdW50aW1lIGNvcmUgQVBJIG9iamVjdHM6XG4gKiAqIGBnZXRBdGxhcyhhdGxhc0tleTogc3RyaW5nKWA6IHJldHVybnMgdGhlIHtAbGluayBUZXh0dXJlQXRsYXN9IGluc3RhbmNlIGZvciB0aGUgZ2l2ZW4gYXRsYXMga2V5LlxuICogKiBgZ2V0U2tlbGV0b25EYXRhKHNrZWxldG9uRGF0YUtleTogc3RyaW5nKWA6IHJldHVybnMgdGhlIHtAbGluayBTa2VsZXRvbkRhdGF9IGluc3RhbmNlIGZvciB0aGUgZ2l2ZW4gc2tlbGV0b24gZGF0YSBrZXkuXG4gKiAqIGBjcmVhdGVTa2VsZXRvbihza2VsZXRvbkRhdGFLZXk6IHN0cmluZywgYXRsYXNLZXk6IHN0cmluZywgcHJlbXVsdGlwbGllZEFscGhhOiBib29sZWFuID0gdHJ1ZSlgOiBjcmVhdGVzIGEgbmV3IHtAbGluayBTa2VsZXRvbn0gaW5zdGFuY2UgZnJvbSB0aGUgZ2l2ZW4gc2tlbGV0b24gZGF0YSBhbmQgYXRsYXMga2V5LlxuICogKiBgaXNQcmVtdWx0aXBsaWVkQWxwaGEoYXRsYXNLZXk6IHN0cmluZylgOiByZXR1cm5zIGB0cnVlYCBpZiB0aGUgYXRsYXMgd2l0aCB0aGUgZ2l2ZW4ga2V5IGhhcyBwcmVtdWx0aXBsaWVkIGFscGhhLlxuICovXG5leHBvcnQgY2xhc3MgU3BpbmVQbHVnaW4gZXh0ZW5kcyBQaGFzZXIuUGx1Z2lucy5TY2VuZVBsdWdpbiB7XG5cdGdhbWU6IFBoYXNlci5HYW1lO1xuXHRwcml2YXRlIGlzV2ViR0w6IGJvb2xlYW47XG5cdGdsOiBXZWJHTFJlbmRlcmluZ0NvbnRleHQgfCBudWxsO1xuXHRnYW1lV2ViR0xSZW5kZXJlcjogU2NlbmVSZW5kZXJlciB8IG51bGwgPSBudWxsO1xuXHRnZXQgd2ViR0xSZW5kZXJlciAoKTogU2NlbmVSZW5kZXJlciB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmdhbWVXZWJHTFJlbmRlcmVyO1xuXHR9XG5cdGNhbnZhc1JlbmRlcmVyOiBTa2VsZXRvblJlbmRlcmVyIHwgbnVsbDtcblx0cGhhc2VyUmVuZGVyZXI6IFBoYXNlci5SZW5kZXJlci5DYW52YXMuQ2FudmFzUmVuZGVyZXIgfCBQaGFzZXIuUmVuZGVyZXIuV2ViR0wuV2ViR0xSZW5kZXJlcjtcblx0cHJpdmF0ZSBza2VsZXRvbkRhdGFDYWNoZTogUGhhc2VyLkNhY2hlLkJhc2VDYWNoZTtcblx0cHJpdmF0ZSBhdGxhc0NhY2hlOiBQaGFzZXIuQ2FjaGUuQmFzZUNhY2hlO1xuXG5cdGNvbnN0cnVjdG9yIChzY2VuZTogUGhhc2VyLlNjZW5lLCBwbHVnaW5NYW5hZ2VyOiBQaGFzZXIuUGx1Z2lucy5QbHVnaW5NYW5hZ2VyLCBwbHVnaW5LZXk6IHN0cmluZykge1xuXHRcdHN1cGVyKHNjZW5lLCBwbHVnaW5NYW5hZ2VyLCBwbHVnaW5LZXkpO1xuXHRcdHRoaXMuZ2FtZSA9IHBsdWdpbk1hbmFnZXIuZ2FtZTtcblx0XHR0aGlzLmlzV2ViR0wgPSB0aGlzLmdhbWUuY29uZmlnLnJlbmRlclR5cGUgPT09IDI7XG5cdFx0dGhpcy5nbCA9IHRoaXMuaXNXZWJHTCA/ICh0aGlzLmdhbWUucmVuZGVyZXIgYXMgUGhhc2VyLlJlbmRlcmVyLldlYkdMLldlYkdMUmVuZGVyZXIpLmdsIDogbnVsbDtcblx0XHR0aGlzLnBoYXNlclJlbmRlcmVyID0gdGhpcy5nYW1lLnJlbmRlcmVyO1xuXHRcdHRoaXMuY2FudmFzUmVuZGVyZXIgPSBudWxsO1xuXHRcdHRoaXMuc2tlbGV0b25EYXRhQ2FjaGUgPSB0aGlzLmdhbWUuY2FjaGUuYWRkQ3VzdG9tKFNQSU5FX1NLRUxFVE9OX0RBVEFfQ0FDSEVfS0VZKTtcblx0XHR0aGlzLmF0bGFzQ2FjaGUgPSB0aGlzLmdhbWUuY2FjaGUuYWRkQ3VzdG9tKFNQSU5FX0FUTEFTX0NBQ0hFX0tFWSk7XG5cblx0XHRsZXQgc2tlbGV0b25Kc29uRmlsZUNhbGxiYWNrID0gZnVuY3Rpb24gKHRoaXM6IGFueSwga2V5OiBzdHJpbmcsXG5cdFx0XHR1cmw6IHN0cmluZyxcblx0XHRcdHhoclNldHRpbmdzOiBQaGFzZXIuVHlwZXMuTG9hZGVyLlhIUlNldHRpbmdzT2JqZWN0KSB7XG5cdFx0XHRsZXQgZmlsZSA9IG5ldyBTcGluZVNrZWxldG9uRGF0YUZpbGUodGhpcyBhcyBhbnksIGtleSwgdXJsLCBTcGluZVNrZWxldG9uRGF0YUZpbGVUeXBlLmpzb24sIHhoclNldHRpbmdzKTtcblx0XHRcdHRoaXMuYWRkRmlsZShmaWxlLmZpbGVzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH07XG5cdFx0cGx1Z2luTWFuYWdlci5yZWdpc3RlckZpbGVUeXBlKFwic3BpbmVKc29uXCIsIHNrZWxldG9uSnNvbkZpbGVDYWxsYmFjaywgc2NlbmUpO1xuXG5cdFx0bGV0IHNrZWxldG9uQmluYXJ5RmlsZUNhbGxiYWNrID0gZnVuY3Rpb24gKHRoaXM6IGFueSwga2V5OiBzdHJpbmcsXG5cdFx0XHR1cmw6IHN0cmluZyxcblx0XHRcdHhoclNldHRpbmdzOiBQaGFzZXIuVHlwZXMuTG9hZGVyLlhIUlNldHRpbmdzT2JqZWN0KSB7XG5cdFx0XHRsZXQgZmlsZSA9IG5ldyBTcGluZVNrZWxldG9uRGF0YUZpbGUodGhpcyBhcyBhbnksIGtleSwgdXJsLCBTcGluZVNrZWxldG9uRGF0YUZpbGVUeXBlLmJpbmFyeSwgeGhyU2V0dGluZ3MpO1xuXHRcdFx0dGhpcy5hZGRGaWxlKGZpbGUuZmlsZXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRwbHVnaW5NYW5hZ2VyLnJlZ2lzdGVyRmlsZVR5cGUoXCJzcGluZUJpbmFyeVwiLCBza2VsZXRvbkJpbmFyeUZpbGVDYWxsYmFjaywgc2NlbmUpO1xuXG5cdFx0bGV0IGF0bGFzRmlsZUNhbGxiYWNrID0gZnVuY3Rpb24gKHRoaXM6IGFueSwga2V5OiBzdHJpbmcsXG5cdFx0XHR1cmw6IHN0cmluZyxcblx0XHRcdHByZW11bHRpcGxpZWRBbHBoYTogYm9vbGVhbixcblx0XHRcdHhoclNldHRpbmdzOiBQaGFzZXIuVHlwZXMuTG9hZGVyLlhIUlNldHRpbmdzT2JqZWN0KSB7XG5cdFx0XHRsZXQgZmlsZSA9IG5ldyBTcGluZUF0bGFzRmlsZSh0aGlzIGFzIGFueSwga2V5LCB1cmwsIHByZW11bHRpcGxpZWRBbHBoYSwgeGhyU2V0dGluZ3MpO1xuXHRcdFx0dGhpcy5hZGRGaWxlKGZpbGUuZmlsZXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fTtcblx0XHRwbHVnaW5NYW5hZ2VyLnJlZ2lzdGVyRmlsZVR5cGUoXCJzcGluZUF0bGFzXCIsIGF0bGFzRmlsZUNhbGxiYWNrLCBzY2VuZSk7XG5cblx0XHRsZXQgYWRkU3BpbmVHYW1lT2JqZWN0ID0gZnVuY3Rpb24gKHRoaXM6IFBoYXNlci5HYW1lT2JqZWN0cy5HYW1lT2JqZWN0RmFjdG9yeSwgeDogbnVtYmVyLCB5OiBudW1iZXIsIGRhdGFLZXk6IHN0cmluZywgYXRsYXNLZXk6IHN0cmluZywgYm91bmRzUHJvdmlkZXI6IFNwaW5lR2FtZU9iamVjdEJvdW5kc1Byb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCBzcGluZVBsdWdpbiA9ICh0aGlzLnNjZW5lLnN5cyBhcyBhbnkpW3BsdWdpbktleV0gYXMgU3BpbmVQbHVnaW47XG5cdFx0XHRsZXQgZ2FtZU9iamVjdCA9IG5ldyBTcGluZUdhbWVPYmplY3QodGhpcy5zY2VuZSwgc3BpbmVQbHVnaW4sIHgsIHksIGRhdGFLZXksIGF0bGFzS2V5LCBib3VuZHNQcm92aWRlcik7XG5cdFx0XHR0aGlzLmRpc3BsYXlMaXN0LmFkZChnYW1lT2JqZWN0KTtcblx0XHRcdHRoaXMudXBkYXRlTGlzdC5hZGQoZ2FtZU9iamVjdCk7XG5cdFx0XHRyZXR1cm4gZ2FtZU9iamVjdDtcblx0XHR9O1xuXG5cdFx0bGV0IG1ha2VTcGluZUdhbWVPYmplY3QgPSBmdW5jdGlvbiAodGhpczogUGhhc2VyLkdhbWVPYmplY3RzLkdhbWVPYmplY3RGYWN0b3J5LCBjb25maWc6IFNwaW5lR2FtZU9iamVjdENvbmZpZywgYWRkVG9TY2VuZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0XHRsZXQgeCA9IGNvbmZpZy54ID8gY29uZmlnLnggOiAwO1xuXHRcdFx0bGV0IHkgPSBjb25maWcueSA/IGNvbmZpZy55IDogMDtcblx0XHRcdGxldCBib3VuZHNQcm92aWRlciA9IGNvbmZpZy5ib3VuZHNQcm92aWRlciA/IGNvbmZpZy5ib3VuZHNQcm92aWRlciA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3Qgc3BpbmVQbHVnaW4gPSAodGhpcy5zY2VuZS5zeXMgYXMgYW55KVtwbHVnaW5LZXldIGFzIFNwaW5lUGx1Z2luO1xuXHRcdFx0bGV0IGdhbWVPYmplY3QgPSBuZXcgU3BpbmVHYW1lT2JqZWN0KHRoaXMuc2NlbmUsIHNwaW5lUGx1Z2luLCB4LCB5LCBjb25maWcuZGF0YUtleSwgY29uZmlnLmF0bGFzS2V5LCBib3VuZHNQcm92aWRlcik7XG5cdFx0XHRpZiAoYWRkVG9TY2VuZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbmZpZy5hZGQgPSBhZGRUb1NjZW5lO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFBoYXNlci5HYW1lT2JqZWN0cy5CdWlsZEdhbWVPYmplY3QodGhpcy5zY2VuZSwgZ2FtZU9iamVjdCwgY29uZmlnKTtcblx0XHR9XG5cdFx0cGx1Z2luTWFuYWdlci5yZWdpc3RlckdhbWVPYmplY3QoKHdpbmRvdyBhcyBhbnkpLlNQSU5FX0dBTUVfT0JKRUNUX1RZUEUgPyAod2luZG93IGFzIGFueSkuU1BJTkVfR0FNRV9PQkpFQ1RfVFlQRSA6IFNQSU5FX0dBTUVfT0JKRUNUX1RZUEUsIGFkZFNwaW5lR2FtZU9iamVjdCwgbWFrZVNwaW5lR2FtZU9iamVjdCk7XG5cdH1cblxuXHRzdGF0aWMgcmVuZGVyZXJJZCA9IDA7XG5cdGJvb3QgKCkge1xuXHRcdGlmICh0aGlzLmlzV2ViR0wgJiYgdGhpcy5nbCkge1xuXHRcdFx0dGhpcy5nYW1lV2ViR0xSZW5kZXJlciB8fD0gbmV3IFNjZW5lUmVuZGVyZXIoKHRoaXMuZ2FtZS5yZW5kZXJlciBhcyBQaGFzZXIuUmVuZGVyZXIuV2ViR0wuV2ViR0xSZW5kZXJlcikuY2FudmFzLCB0aGlzLmdsLCB0cnVlKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2NlbmUpIHtcblx0XHRcdHRoaXMuY2FudmFzUmVuZGVyZXIgfHw9IG5ldyBTa2VsZXRvblJlbmRlcmVyKHRoaXMuc2NlbmUuc3lzLmNvbnRleHQpO1xuXHRcdH1cblxuXHRcdHRoaXMub25SZXNpemUoKTtcblx0XHRpZiAodGhpcy5zeXN0ZW1zKSB7XG5cdFx0XHR0aGlzLnN5c3RlbXMuZXZlbnRzLm9uY2UoXCJkZXN0cm95XCIsIHRoaXMuZGVzdHJveSwgdGhpcyk7XG5cdFx0XHR0aGlzLnN5c3RlbXMuZXZlbnRzLm9uKFwic3RhcnRcIiwgdGhpcy5vblN0YXJ0LCB0aGlzKTtcblx0XHRcdHRoaXMuc3lzdGVtcy5ldmVudHMub24oXCJzaHV0ZG93blwiLCB0aGlzLnNodXRkb3duLCB0aGlzKTtcblx0XHR9XG5cblx0XHR0aGlzLmdhbWUuZXZlbnRzLm9uY2UoXCJkZXN0cm95XCIsIHRoaXMuZ2FtZURlc3Ryb3ksIHRoaXMpO1xuXHR9XG5cblx0b25SZXNpemUgKCkge1xuXHRcdGNvbnN0IHBoYXNlclJlbmRlcmVyID0gdGhpcy5nYW1lLnJlbmRlcmVyO1xuXHRcdGNvbnN0IHNjZW5lUmVuZGVyZXIgPSB0aGlzLndlYkdMUmVuZGVyZXI7XG5cblx0XHRpZiAocGhhc2VyUmVuZGVyZXIgJiYgc2NlbmVSZW5kZXJlcikge1xuXHRcdFx0Y29uc3Qgdmlld3BvcnRXaWR0aCA9IHBoYXNlclJlbmRlcmVyLndpZHRoO1xuXHRcdFx0Y29uc3Qgdmlld3BvcnRIZWlnaHQgPSBwaGFzZXJSZW5kZXJlci5oZWlnaHQ7XG5cdFx0XHRzY2VuZVJlbmRlcmVyLmNhbWVyYS5wb3NpdGlvbi54ID0gdmlld3BvcnRXaWR0aCAvIDI7XG5cdFx0XHRzY2VuZVJlbmRlcmVyLmNhbWVyYS5wb3NpdGlvbi55ID0gdmlld3BvcnRIZWlnaHQgLyAyO1xuXHRcdFx0c2NlbmVSZW5kZXJlci5jYW1lcmEudXAueSA9IC0xO1xuXHRcdFx0c2NlbmVSZW5kZXJlci5jYW1lcmEuZGlyZWN0aW9uLnogPSAxO1xuXHRcdFx0c2NlbmVSZW5kZXJlci5jYW1lcmEuc2V0Vmlld3BvcnQodmlld3BvcnRXaWR0aCwgdmlld3BvcnRIZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdG9uU3RhcnQgKCkge1xuXHRcdHRoaXMuZ2FtZS5zY2FsZS5vbihQaGFzZXIuU2NhbGUuRXZlbnRzLlJFU0laRSwgdGhpcy5vblJlc2l6ZSwgdGhpcyk7XG5cdH1cblxuXHRzaHV0ZG93biAoKSB7XG5cdFx0aWYgKHRoaXMuaXNXZWJHTCkge1xuXHRcdFx0dGhpcy5nYW1lLnNjYWxlLm9mZihQaGFzZXIuU2NhbGUuRXZlbnRzLlJFU0laRSwgdGhpcy5vblJlc2l6ZSwgdGhpcyk7XG5cdFx0fVxuXHR9XG5cblx0ZGVzdHJveSAoKSB7XG5cdFx0dGhpcy5zaHV0ZG93bigpO1xuXHRcdHRoaXMuc3lzdGVtcz8uZXZlbnRzLm9mZihcInN0YXJ0XCIsIHRoaXMub25TdGFydCwgdGhpcyk7XG5cdFx0dGhpcy5zeXN0ZW1zPy5ldmVudHMub2ZmKFwic2h1dGRvd25cIiwgdGhpcy5zaHV0ZG93biwgdGhpcyk7XG5cdH1cblxuXHRnYW1lRGVzdHJveSAoKSB7XG5cdFx0dGhpcy5wbHVnaW5NYW5hZ2VyLnJlbW92ZUdhbWVPYmplY3QoKHdpbmRvdyBhcyBhbnkpLlNQSU5FX0dBTUVfT0JKRUNUX1RZUEUgPyAod2luZG93IGFzIGFueSkuU1BJTkVfR0FNRV9PQkpFQ1RfVFlQRSA6IFNQSU5FX0dBTUVfT0JKRUNUX1RZUEUsIHRydWUsIHRydWUpO1xuXHRcdGlmICh0aGlzLndlYkdMUmVuZGVyZXIpIHRoaXMud2ViR0xSZW5kZXJlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5nYW1lV2ViR0xSZW5kZXJlciA9IG51bGw7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgVGV4dHVyZUF0bGFzIGluc3RhbmNlIGZvciB0aGUgZ2l2ZW4ga2V5ICovXG5cdGdldEF0bGFzIChhdGxhc0tleTogc3RyaW5nKSB7XG5cdFx0bGV0IGF0bGFzOiBUZXh0dXJlQXRsYXM7XG5cdFx0aWYgKHRoaXMuYXRsYXNDYWNoZS5leGlzdHMoYXRsYXNLZXkpKSB7XG5cdFx0XHRhdGxhcyA9IHRoaXMuYXRsYXNDYWNoZS5nZXQoYXRsYXNLZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgYXRsYXNGaWxlID0gdGhpcy5nYW1lLmNhY2hlLnRleHQuZ2V0KGF0bGFzS2V5KSBhcyB7IGRhdGE6IHN0cmluZywgcHJlbXVsdGlwbGllZEFscGhhOiBib29sZWFuIH07XG5cdFx0XHRhdGxhcyA9IG5ldyBUZXh0dXJlQXRsYXMoYXRsYXNGaWxlLmRhdGEpO1xuXHRcdFx0aWYgKHRoaXMuaXNXZWJHTCkge1xuXHRcdFx0XHRsZXQgZ2wgPSB0aGlzLmdsITtcblx0XHRcdFx0Y29uc3QgcGhhc2VyVW5wYWNrUG1hVmFsdWUgPSBnbC5nZXRQYXJhbWV0ZXIoZ2wuVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMKTtcblx0XHRcdFx0aWYgKHBoYXNlclVucGFja1BtYVZhbHVlKSBnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIGZhbHNlKTtcblx0XHRcdFx0Zm9yIChsZXQgYXRsYXNQYWdlIG9mIGF0bGFzLnBhZ2VzKSB7XG5cdFx0XHRcdFx0YXRsYXNQYWdlLnNldFRleHR1cmUobmV3IEdMVGV4dHVyZShnbCwgdGhpcy5nYW1lLnRleHR1cmVzLmdldChhdGxhc0tleSArIFwiIVwiICsgYXRsYXNQYWdlLm5hbWUpLmdldFNvdXJjZUltYWdlKCkgYXMgSFRNTEltYWdlRWxlbWVudCB8IEltYWdlQml0bWFwLCBmYWxzZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwaGFzZXJVbnBhY2tQbWFWYWx1ZSkgZ2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX1BSRU1VTFRJUExZX0FMUEhBX1dFQkdMLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvciAobGV0IGF0bGFzUGFnZSBvZiBhdGxhcy5wYWdlcykge1xuXHRcdFx0XHRcdGF0bGFzUGFnZS5zZXRUZXh0dXJlKG5ldyBDYW52YXNUZXh0dXJlKHRoaXMuZ2FtZS50ZXh0dXJlcy5nZXQoYXRsYXNLZXkgKyBcIiFcIiArIGF0bGFzUGFnZS5uYW1lKS5nZXRTb3VyY2VJbWFnZSgpIGFzIEhUTUxJbWFnZUVsZW1lbnQgfCBJbWFnZUJpdG1hcCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmF0bGFzQ2FjaGUuYWRkKGF0bGFzS2V5LCBhdGxhcyk7XG5cdFx0fVxuXHRcdHJldHVybiBhdGxhcztcblx0fVxuXG5cdC8qKiBSZXR1cm5zIHdoZXRoZXIgdGhlIFRleHR1cmVBdGxhcyB1c2VzIHByZW11bHRpcGxpZWQgYWxwaGEgKi9cblx0aXNBdGxhc1ByZW11bHRpcGxpZWQgKGF0bGFzS2V5OiBzdHJpbmcpIHtcblx0XHRsZXQgYXRsYXNGaWxlID0gdGhpcy5nYW1lLmNhY2hlLnRleHQuZ2V0KGF0bGFzS2V5KTtcblx0XHRpZiAoIWF0bGFzRmlsZSkgcmV0dXJuIGZhbHNlO1xuXHRcdHJldHVybiBhdGxhc0ZpbGUucHJlbXVsdGlwbGllZEFscGhhO1xuXHR9XG5cblx0LyoqIFJldHVybnMgdGhlIFNrZWxldG9uRGF0YSBpbnN0YW5jZSBmb3IgdGhlIGdpdmVuIGRhdGEgYW5kIGF0bGFzIGtleSAqL1xuXHRnZXRTa2VsZXRvbkRhdGEgKGRhdGFLZXk6IHN0cmluZywgYXRsYXNLZXk6IHN0cmluZykge1xuXHRcdGNvbnN0IGF0bGFzID0gdGhpcy5nZXRBdGxhcyhhdGxhc0tleSlcblx0XHRjb25zdCBjb21iaW5lZEtleSA9IGRhdGFLZXkgKyBhdGxhc0tleTtcblx0XHRsZXQgc2tlbGV0b25EYXRhOiBTa2VsZXRvbkRhdGE7XG5cdFx0aWYgKHRoaXMuc2tlbGV0b25EYXRhQ2FjaGUuZXhpc3RzKGNvbWJpbmVkS2V5KSkge1xuXHRcdFx0c2tlbGV0b25EYXRhID0gdGhpcy5za2VsZXRvbkRhdGFDYWNoZS5nZXQoY29tYmluZWRLZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5nYW1lLmNhY2hlLmpzb24uZXhpc3RzKGRhdGFLZXkpKSB7XG5cdFx0XHRcdGxldCBqc29uRmlsZSA9IHRoaXMuZ2FtZS5jYWNoZS5qc29uLmdldChkYXRhS2V5KSBhcyBhbnk7XG5cdFx0XHRcdGxldCBqc29uID0gbmV3IFNrZWxldG9uSnNvbihuZXcgQXRsYXNBdHRhY2htZW50TG9hZGVyKGF0bGFzKSk7XG5cdFx0XHRcdHNrZWxldG9uRGF0YSA9IGpzb24ucmVhZFNrZWxldG9uRGF0YShqc29uRmlsZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgYmluYXJ5RmlsZSA9IHRoaXMuZ2FtZS5jYWNoZS5iaW5hcnkuZ2V0KGRhdGFLZXkpIGFzIEFycmF5QnVmZmVyO1xuXHRcdFx0XHRsZXQgYmluYXJ5ID0gbmV3IFNrZWxldG9uQmluYXJ5KG5ldyBBdGxhc0F0dGFjaG1lbnRMb2FkZXIoYXRsYXMpKTtcblx0XHRcdFx0c2tlbGV0b25EYXRhID0gYmluYXJ5LnJlYWRTa2VsZXRvbkRhdGEobmV3IFVpbnQ4QXJyYXkoYmluYXJ5RmlsZSkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5za2VsZXRvbkRhdGFDYWNoZS5hZGQoY29tYmluZWRLZXksIHNrZWxldG9uRGF0YSk7XG5cdFx0fVxuXHRcdHJldHVybiBza2VsZXRvbkRhdGE7XG5cdH1cblxuXHQvKiogQ3JlYXRlcyBhIG5ldyBTa2VsZXRvbiBpbnN0YW5jZSBmcm9tIHRoZSBkYXRhIGFuZCBhdGxhcy4gKi9cblx0Y3JlYXRlU2tlbGV0b24gKGRhdGFLZXk6IHN0cmluZywgYXRsYXNLZXk6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLmlzV2ViR0wpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5waGFzZXJSZW5kZXJlciBhcyBQaGFzZXIuUmVuZGVyZXIuV2ViR0wuV2ViR0xSZW5kZXJlcjtcblx0XHRcdHJlbmRlcmVyLmdsV3JhcHBlci51cGRhdGVUZXh0dXJpbmdGbGlwWSh7IHRleHR1cmluZzogeyBmbGlwWTogZmFsc2UgfSB9KTtcblx0XHRcdHJlbmRlcmVyLnJlbmRlck5vZGVzLmdldE5vZGUoXCJZaWVsZENvbnRleHRcIik/LnJ1bigpO1xuXHRcdH1cblx0XHRjb25zdCBza2VsZXRvbiA9IG5ldyBTa2VsZXRvbih0aGlzLmdldFNrZWxldG9uRGF0YShkYXRhS2V5LCBhdGxhc0tleSkpO1xuXHRcdGlmICh0aGlzLmlzV2ViR0wpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5waGFzZXJSZW5kZXJlciBhcyBQaGFzZXIuUmVuZGVyZXIuV2ViR0wuV2ViR0xSZW5kZXJlcjtcblx0XHRcdHJlbmRlcmVyLnJlbmRlck5vZGVzLmdldE5vZGUoXCJSZWJpbmRDb250ZXh0XCIpPy5ydW4oKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNrZWxldG9uO1xuXHR9XG59XG5cbmVudW0gU3BpbmVTa2VsZXRvbkRhdGFGaWxlVHlwZSB7XG5cdGpzb24sXG5cdGJpbmFyeVxufVxuXG5pbnRlcmZhY2UgU3BpbmVTa2VsZXRvbkRhdGFGaWxlQ29uZmlnIHtcblx0a2V5OiBzdHJpbmc7XG5cdHVybDogc3RyaW5nO1xuXHR0eXBlOiBcInNwaW5lSnNvblwiIHwgXCJzcGluZUJpbmFyeVwiO1xuXHR4aHJTZXR0aW5ncz86IFBoYXNlci5UeXBlcy5Mb2FkZXIuWEhSU2V0dGluZ3NPYmplY3Rcbn1cblxuY2xhc3MgU3BpbmVTa2VsZXRvbkRhdGFGaWxlIGV4dGVuZHMgUGhhc2VyLkxvYWRlci5NdWx0aUZpbGUge1xuXHRjb25zdHJ1Y3RvciAobG9hZGVyOiBQaGFzZXIuTG9hZGVyLkxvYWRlclBsdWdpbiwga2V5OiBzdHJpbmcgfCBTcGluZVNrZWxldG9uRGF0YUZpbGVDb25maWcsIHVybD86IHN0cmluZywgcHVibGljIGZpbGVUeXBlPzogU3BpbmVTa2VsZXRvbkRhdGFGaWxlVHlwZSwgeGhyU2V0dGluZ3M/OiBQaGFzZXIuVHlwZXMuTG9hZGVyLlhIUlNldHRpbmdzT2JqZWN0KSB7XG5cdFx0aWYgKHR5cGVvZiBrZXkgIT09IFwic3RyaW5nXCIpIHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGtleTtcblx0XHRcdGtleSA9IGNvbmZpZy5rZXk7XG5cdFx0XHR1cmwgPSBjb25maWcudXJsO1xuXHRcdFx0ZmlsZVR5cGUgPSBjb25maWcudHlwZSA9PT0gXCJzcGluZUpzb25cIiA/IFNwaW5lU2tlbGV0b25EYXRhRmlsZVR5cGUuanNvbiA6IFNwaW5lU2tlbGV0b25EYXRhRmlsZVR5cGUuYmluYXJ5O1xuXHRcdFx0eGhyU2V0dGluZ3MgPSBjb25maWcueGhyU2V0dGluZ3M7XG5cdFx0fVxuXHRcdGxldCBmaWxlID0gbnVsbDtcblx0XHRsZXQgaXNKc29uID0gZmlsZVR5cGUgPT0gU3BpbmVTa2VsZXRvbkRhdGFGaWxlVHlwZS5qc29uO1xuXHRcdGlmIChpc0pzb24pIHtcblx0XHRcdGZpbGUgPSBuZXcgUGhhc2VyLkxvYWRlci5GaWxlVHlwZXMuSlNPTkZpbGUobG9hZGVyLCB7XG5cdFx0XHRcdGtleToga2V5LFxuXHRcdFx0XHR1cmw6IHVybCxcblx0XHRcdFx0ZXh0ZW5zaW9uOiBcImpzb25cIixcblx0XHRcdFx0eGhyU2V0dGluZ3M6IHhoclNldHRpbmdzLFxuXHRcdFx0fSBhcyBQaGFzZXIuVHlwZXMuTG9hZGVyLkZpbGVUeXBlcy5KU09ORmlsZUNvbmZpZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZpbGUgPSBuZXcgUGhhc2VyLkxvYWRlci5GaWxlVHlwZXMuQmluYXJ5RmlsZShsb2FkZXIsIHtcblx0XHRcdFx0a2V5OiBrZXksXG5cdFx0XHRcdHVybDogdXJsLFxuXHRcdFx0XHRleHRlbnNpb246IFwic2tlbFwiLFxuXHRcdFx0XHR4aHJTZXR0aW5nczogeGhyU2V0dGluZ3MsXG5cdFx0XHR9IGFzIFBoYXNlci5UeXBlcy5Mb2FkZXIuRmlsZVR5cGVzLkJpbmFyeUZpbGVDb25maWcpO1xuXHRcdH1cblx0XHRzdXBlcihsb2FkZXIsIFNQSU5FX1NLRUxFVE9OX0RBVEFfRklMRV9UWVBFLCBrZXksIFtmaWxlXSk7XG5cdH1cblxuXHRvbkZpbGVDb21wbGV0ZSAoZmlsZTogUGhhc2VyLkxvYWRlci5GaWxlKSB7XG5cdFx0dGhpcy5wZW5kaW5nLS07XG5cdH1cblxuXHRhZGRUb0NhY2hlICgpIHtcblx0XHRpZiAodGhpcy5pc1JlYWR5VG9Qcm9jZXNzKCkpIHRoaXMuZmlsZXNbMF0uYWRkVG9DYWNoZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBTcGluZUF0bGFzRmlsZUNvbmZpZyB7XG5cdGtleTogc3RyaW5nO1xuXHR1cmw6IHN0cmluZztcblx0cHJlbXVsdGlwbGllZEFscGhhPzogYm9vbGVhbjtcblx0eGhyU2V0dGluZ3M/OiBQaGFzZXIuVHlwZXMuTG9hZGVyLlhIUlNldHRpbmdzT2JqZWN0O1xufVxuXG5jbGFzcyBTcGluZUF0bGFzRmlsZSBleHRlbmRzIFBoYXNlci5Mb2FkZXIuTXVsdGlGaWxlIHtcblx0Y29uc3RydWN0b3IgKGxvYWRlcjogUGhhc2VyLkxvYWRlci5Mb2FkZXJQbHVnaW4sIGtleTogc3RyaW5nIHwgU3BpbmVBdGxhc0ZpbGVDb25maWcsIHVybD86IHN0cmluZywgcHVibGljIHByZW11bHRpcGxpZWRBbHBoYT86IGJvb2xlYW4sIHhoclNldHRpbmdzPzogUGhhc2VyLlR5cGVzLkxvYWRlci5YSFJTZXR0aW5nc09iamVjdCkge1xuXHRcdGlmICh0eXBlb2Yga2V5ICE9PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBrZXk7XG5cdFx0XHRrZXkgPSBjb25maWcua2V5O1xuXHRcdFx0dXJsID0gY29uZmlnLnVybDtcblx0XHRcdHByZW11bHRpcGxpZWRBbHBoYSA9IGNvbmZpZy5wcmVtdWx0aXBsaWVkQWxwaGE7XG5cdFx0XHR4aHJTZXR0aW5ncyA9IGNvbmZpZy54aHJTZXR0aW5ncztcblx0XHR9XG5cblx0XHRzdXBlcihsb2FkZXIsIFNQSU5FX0FUTEFTX0ZJTEVfVFlQRSwga2V5LCBbXG5cdFx0XHRuZXcgUGhhc2VyLkxvYWRlci5GaWxlVHlwZXMuVGV4dEZpbGUobG9hZGVyLCB7XG5cdFx0XHRcdGtleToga2V5LFxuXHRcdFx0XHR1cmw6IHVybCxcblx0XHRcdFx0eGhyU2V0dGluZ3M6IHhoclNldHRpbmdzLFxuXHRcdFx0XHRleHRlbnNpb246IFwiYXRsYXNcIlxuXHRcdFx0fSlcblx0XHRdKTtcblx0fVxuXG5cdG9uRmlsZUNvbXBsZXRlIChmaWxlOiBQaGFzZXIuTG9hZGVyLkZpbGUpIHtcblx0XHRpZiAodGhpcy5maWxlcy5pbmRleE9mKGZpbGUpICE9IC0xKSB7XG5cdFx0XHR0aGlzLnBlbmRpbmctLTtcblxuXHRcdFx0aWYgKGZpbGUudHlwZSA9PSBcInRleHRcIikge1xuXHRcdFx0XHR2YXIgbGluZXMgPSBmaWxlLmRhdGEuc3BsaXQoL1xcclxcbnxcXHJ8XFxuLyk7XG5cdFx0XHRcdGxldCB0ZXh0dXJlcyA9IFtdO1xuXHRcdFx0XHR0ZXh0dXJlcy5wdXNoKGxpbmVzWzBdKTtcblx0XHRcdFx0Zm9yICh2YXIgdCA9IDE7IHQgPCBsaW5lcy5sZW5ndGg7IHQrKykge1xuXHRcdFx0XHRcdHZhciBsaW5lID0gbGluZXNbdF07XG5cdFx0XHRcdFx0aWYgKGxpbmUudHJpbSgpID09PSAnJyAmJiB0IDwgbGluZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdFx0bGluZSA9IGxpbmVzW3QgKyAxXTtcblx0XHRcdFx0XHRcdHRleHR1cmVzLnB1c2gobGluZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGZpbGVVcmwgPSBmaWxlLnVybDtcblx0XHRcdFx0aWYgKHR5cGVvZiBmaWxlVXJsID09PSBcIm9iamVjdFwiKSBmaWxlVXJsID0gZmlsZS5zcmM7XG5cdFx0XHRcdGxldCBiYXNlUGF0aCA9IChmaWxlVXJsLm1hdGNoKC9eLipcXC8vKSA/PyBcIlwiKS50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAodGhpcy5sb2FkZXIucGF0aCAmJiB0aGlzLmxvYWRlci5wYXRoLmxlbmd0aCA+IDAgJiYgYmFzZVBhdGguc3RhcnRzV2l0aCh0aGlzLmxvYWRlci5wYXRoKSlcblx0XHRcdFx0XHRiYXNlUGF0aCA9IGJhc2VQYXRoLnNsaWNlKHRoaXMubG9hZGVyLnBhdGgubGVuZ3RoKTtcblxuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHRleHR1cmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0dmFyIHVybCA9IGJhc2VQYXRoICsgdGV4dHVyZXNbaV07XG5cdFx0XHRcdFx0dmFyIGtleSA9IGZpbGUua2V5ICsgXCIhXCIgKyB0ZXh0dXJlc1tpXTtcblx0XHRcdFx0XHR2YXIgaW1hZ2UgPSBuZXcgUGhhc2VyLkxvYWRlci5GaWxlVHlwZXMuSW1hZ2VGaWxlKHRoaXMubG9hZGVyLCBrZXksIHVybCk7XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMubG9hZGVyLmtleUV4aXN0cyhpbWFnZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuYWRkVG9NdWx0aUZpbGUoaW1hZ2UpO1xuXHRcdFx0XHRcdFx0dGhpcy5sb2FkZXIuYWRkRmlsZShpbWFnZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YWRkVG9DYWNoZSAoKSB7XG5cdFx0aWYgKHRoaXMuaXNSZWFkeVRvUHJvY2VzcygpKSB7XG5cdFx0XHRsZXQgdGV4dHVyZU1hbmFnZXIgPSB0aGlzLmxvYWRlci50ZXh0dXJlTWFuYWdlcjtcblx0XHRcdGZvciAobGV0IGZpbGUgb2YgdGhpcy5maWxlcykge1xuXHRcdFx0XHRpZiAoZmlsZS50eXBlID09IFwiaW1hZ2VcIikge1xuXHRcdFx0XHRcdGlmICghdGV4dHVyZU1hbmFnZXIuZXhpc3RzKGZpbGUua2V5KSkge1xuXHRcdFx0XHRcdFx0dGV4dHVyZU1hbmFnZXIuYWRkSW1hZ2UoZmlsZS5rZXksIGZpbGUuZGF0YSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucHJlbXVsdGlwbGllZEFscGhhID0gdGhpcy5wcmVtdWx0aXBsaWVkQWxwaGEgPz8gKGZpbGUuZGF0YS5pbmRleE9mKFwicG1hOiB0cnVlXCIpID49IDAgfHwgZmlsZS5kYXRhLmluZGV4T2YoXCJwbWE6dHJ1ZVwiKSA+PSAwKTtcblx0XHRcdFx0XHRmaWxlLmRhdGEgPSB7XG5cdFx0XHRcdFx0XHRkYXRhOiBmaWxlLmRhdGEsXG5cdFx0XHRcdFx0XHRwcmVtdWx0aXBsaWVkQWxwaGE6IHRoaXMucHJlbXVsdGlwbGllZEFscGhhLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0ZmlsZS5hZGRUb0NhY2hlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdfQ==