import KORCImageUtilPlugin from "../main";
import {SharedAPIs} from "./SharedAPIs";
import {PluginSettings} from "./PluginSettings";
import {TFile} from "obsidian";
import {SettingsAPIs} from "./SettingsAPIs";
import {AsyncChildProcessAPIs} from "./AsyncChildProcessAPIs";
import {FFmpegAPIs} from "./FFmpegAPIs";
import {CompressAPIs} from "./CompressAPIs";

export class PluginAPIs {
	public readonly plugin: KORCImageUtilPlugin;
	public readonly sharedAPIs: SharedAPIs;
	public readonly settingsAPIs: SettingsAPIs;
	public readonly ffmpegAPIs: FFmpegAPIs;
	public readonly compressAPIs: CompressAPIs;

	constructor(plugin: KORCImageUtilPlugin) {
		this.plugin = plugin;
		this.sharedAPIs = new SharedAPIs(plugin.app);
		this.settingsAPIs = new SettingsAPIs(this);
		this.ffmpegAPIs = new FFmpegAPIs(this);
		this.compressAPIs = new CompressAPIs(this);
	}

	validImageDirectory(): boolean {
		return this.settingsAPIs.isValidImageDirectoryName_OSView2();
	}

	validOwnerPocket(): boolean {
		return this.validImageDirectory();
	}

	tryGetImageDirectoryFullPath_OSView(owner: TFile): string | null | Error {
		try {
			const ownerPath = this.sharedAPIs.obsidianAPIs.getFilePath_OSView(owner);
			const ownerParentPath = this.sharedAPIs.getParentPath_OSView(ownerPath);
			const t = this.settingsAPIs.tryGetValidImageDirectoryName_OSView();
			if (typeof t != "string") return t;
			const imageDirName: string = t;
			return this.sharedAPIs.concatPath_OSView(
				[
					ownerParentPath,
					imageDirName
				]
			);
		} catch (e) {
			return e;
		}
	}

	tryGetOwnerPocketPath_OSView(owner: TFile): string | null | Error {
		return this.tryGetImageDirectoryFullPath_OSView(owner);
	}

	tryGetCorrectImageFullPath(image: TFile, owner: TFile): string | null | Error {
		try {
			const t = this.tryGetImageDirectoryFullPath_OSView(owner);
			if (typeof t != "string") return t;
			const imageDirPath = t;
			return this.sharedAPIs.obsidianAPIs.concatDirectoryPathAndItemName_ObsidianView(
				imageDirPath,
				this.sharedAPIs.obsidianAPIs.getFileName_OSView(image)
			);
		} catch (e) {
			return e;
		}
	}

	getCorrectImageFullPath2(image: TFile, ownerPocketPath: string): string {
		return this.sharedAPIs.obsidianAPIs.concatDirectoryPathAndItemName_ObsidianView(
			ownerPocketPath,
			this.sharedAPIs.obsidianAPIs.getFileName_OSView(image)
		);
	}

	getCorrectImageFullPath3(imageName: string, ownerPocketPath: string): string {
		return this.sharedAPIs.obsidianAPIs.concatDirectoryPathAndItemName_ObsidianView(
			ownerPocketPath,
			imageName
		);
	}

	tryGetExecutableDirectoryFullPath_OSView(): string | null | Error {
		const vaultPath = this.sharedAPIs.obsidianAPIs.getVaultPath_OSView();
		const t = this.settingsAPIs.tryGetValidExecutableDirectoryRelativePath_OSView();
		if (typeof t != "string") return t;
		let exeDirPathRel = t;
		return this.sharedAPIs.concatPath_OSView(
			[
				vaultPath,
				exeDirPathRel
			]
		);
	}

	tryGetExecutableFullPath_OSView(name: string): string | null | Error {
		name = name.trim();
		if (!name.endsWith('.exe')) name += '.exe';
		const t = this.tryGetExecutableDirectoryFullPath_OSView();
		if (typeof t != "string") return t;
		const exeDirPathOS = t;
		return this.sharedAPIs.concatPath_OSView([exeDirPathOS, name]);
	}

	async tryIsExecutableExist_async(name: string): Promise<boolean | null | Error> {
		return new Promise<boolean>(async (resolve, reject) => {
			const t = this.tryGetExecutableFullPath_OSView(name);
			if (typeof t != "string") return t;
			const exePath = t;
			const exist = await this.sharedAPIs.exist_async(exePath);
			resolve(exist);
		});
	}

	public getJSScriptFullPath_OSView(name: string): string {
		name = name.trim();
		if (!name.endsWith('.js')) name += '.js';
		const t = this.tryGetExecutableDirectoryFullPath_OSView();
		if (typeof t != "string") {
			if (t instanceof Error) throw t;
			else throw new Error('failed to get executable directory path');
		}
		const exeDirPathOS = t;
		return this.sharedAPIs.concatPath_OSView([exeDirPathOS, name]);
	}
}
