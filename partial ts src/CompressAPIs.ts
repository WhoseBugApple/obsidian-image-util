import {TFile} from "obsidian";
import {PathViewRecord} from "./PathViewRecord";
import {PluginAPIs} from "./PluginAPIs";
import {OneTaskOneTime} from "./OneTaskOneTime";
import {FFmpegCreateFileOutput} from "./FFmpegAPIs";

export class CompressSuccessRenameFailError extends Error {
	constructor(message?: string) {
		super(message);
	}
}

export class CompressAPIs {
	public readonly pluginAPIs: PluginAPIs;
	public readonly compressorRenamer: ImageCompressorRenamer;

	constructor(pluginAPIs: PluginAPIs) {
		this.pluginAPIs = pluginAPIs;
		this.compressorRenamer = new ImageCompressorRenamer(pluginAPIs);
	}
}

class ImageCompressorRenamer {
	public readonly pluginAPIs: PluginAPIs;
	public readonly renamer: ImageRenamer;

	constructor(pluginAPIs: PluginAPIs) {
		this.pluginAPIs = pluginAPIs;
		this.renamer = new ImageRenamer(pluginAPIs);
	}

	// only one execute at the same time
	private readonly oneTaskOneTime: OneTaskOneTime = new OneTaskOneTime();
	private taskSubmitCount: 0;
	private taskExecCount: 0;
	private taskSuccessCount: 0;
	public async tryCompressImageThenRename_AloneExecute_async(imageFile: TFile, log: boolean = false): Promise<number | Error | null> {
		this.taskSubmitCount++;
		if (this.oneTaskOneTime.alreadyHasOneRunningTask()) return null;
		this.oneTaskOneTime.knowATaskIsRunning();
		this.taskExecCount++;
		try {
			const res = await this.tryCompressImageThenRename_async(imageFile, log);
			if (res == null || res instanceof Error) return res;
			this.taskSuccessCount++;
			return 0;
		} catch (e) {
			return e;
		} finally {
			this.oneTaskOneTime.knowThatTaskEnd();
		}
	}

	// return number(good, compressed OR NOT need compress) Error|null(bad)
	// try following
	//   create compressed outs
	//   choose best from out
	//   if smaller replace old with best
	//   clean outs
	//   rename old
	//   return isReplaced
	// on fail, clean temp files, return Error
	private async tryCompressImageThenRename_async(imageFile: TFile, logSuccess: boolean = false): Promise<number | Error | null> {
		if (this.pluginAPIs.settingsAPIs.isReadonly(this.pluginAPIs.sharedAPIs.obsidianAPIs.getFilePath_OSView(imageFile))) return 0;

		let outPaths: string[] = [];
		try {
			const t = await this.pluginAPIs.ffmpegAPIs.trySpawnFFmpeg_createAVIF_libaom(imageFile, 23);
			if (t instanceof Error) throw t;
			const fout: FFmpegCreateFileOutput = t;
			outPaths.push(fout.createdFilePath);

			const bestPath = await this.chooseBest_async(outPaths);

			const replaced = await this.replaceIfSmaller_async(imageFile, bestPath);

			if (logSuccess) {
				await this.logFiles_compressionLog_async(imageFile, outPaths, bestPath);
			}

			await this.cleanTemps_async(outPaths, imageFile);
			outPaths = [];

			const newSuffix = this.pluginAPIs.sharedAPIs.getDotStartSuffixName_OSView(
				replaced ? bestPath : this.pluginAPIs.sharedAPIs.obsidianAPIs.getFilePath_OSView(imageFile)
			);

			const ri = await this.renamer.tryRenameImage(imageFile, newSuffix, logSuccess);

			if (ri instanceof Error) throw new CompressSuccessRenameFailError('compress success rename fail because: ' + ri.message);
			return 0;
		} catch (e) {
			await this.cleanTemps_async(outPaths, imageFile);
			return e;
		}
	}

	private async chooseBest_async(candidates: string[]): Promise<string> {
		if (candidates.length == 1) return candidates[0];

		let minIdx = 0;
		let minSize = await this.pluginAPIs.sharedAPIs.getSize_async(candidates[0]);

		for(let i=1; i<candidates.length; i++) {
			let curSize = await this.pluginAPIs.sharedAPIs.getSize_async(candidates[i]);
			if (curSize < minSize) {
				minIdx = i;
				minSize = curSize;
			}
		}

		return candidates[minIdx];
	}

	// return is-replaced
	private async replaceIfSmaller_async(imageFile: TFile, anotherImagePath: string): Promise<boolean> {
		const originSize: number = this.pluginAPIs.sharedAPIs.obsidianAPIs.getFileSize(imageFile);
		const anotherSize: number = await this.pluginAPIs.sharedAPIs.getSize_async(anotherImagePath);
		if (anotherSize < originSize) {
			let anotherBytes = await this.pluginAPIs.sharedAPIs.readBytes_async(anotherImagePath);
			await this.pluginAPIs.sharedAPIs.obsidianAPIs.writeFileBinary_async(imageFile, anotherBytes);
			return true;
		}
		return false;
	}

	private async cleanTemps_async(tempPathsOS: string[], imageFile: TFile): Promise<void> {
		const tempPathsObs = this.getPaths_ObsidianView(tempPathsOS, imageFile);
		const files = await this.pluginAPIs.sharedAPIs.obsidianAPIs.waitUntilTFilesReady_async(
			tempPathsObs,
			5000,
			500
		);
		await this.pluginAPIs.sharedAPIs.obsidianAPIs.tryDeleteFiles_async(files);
	}

	private getPaths_ObsidianView(pathOS: string[], neighborFile: TFile): string[] {
		const pathObs: string[] = [];
		pathOS.forEach(one => {
			pathObs.push(
				this.pluginAPIs.sharedAPIs.obsidianAPIs.getNeighborPath_ObsidianView(
					neighborFile,
					this.pluginAPIs.sharedAPIs.getName_OSView(one)
				)
			)
		});
		return pathObs;
	}

	private async logFiles_compressionLog_async(inFile: TFile, outFilePaths: string[], bestOutFilePath: string) {
		console.log('in file:');
		console.log(inFile);
		console.log('out file paths:');
		console.log(outFilePaths);
		console.log('best out file path:');
		console.log(bestOutFilePath);

		this.pluginAPIs.sharedAPIs.reportLog(
			`in file:\n` +
			`- name: ${this.pluginAPIs.sharedAPIs.obsidianAPIs.getFileName_ObsidianView(inFile)}\n` +
			`- size: ${this.pluginAPIs.sharedAPIs.obsidianAPIs.getFileSize(inFile)}\n` +
			`out files:\n` +
			`- count: ${outFilePaths.length}\n` +
			`best out file:\n` +
			`- name: ${this.pluginAPIs.sharedAPIs.getName_OSView(bestOutFilePath)}\n` +
			`- size: ${this.fileSizeToReadableFileSize(await this.pluginAPIs.sharedAPIs.getSize_async(bestOutFilePath))}\n`,
			false, true, true, false
		);
	}

	private fileSizeToReadableFileSize(size: number): string {
		let result: string = '';
		let sizeStr = size.toString();

		let partStart = sizeStr.length - 3;
		let partEnd = sizeStr.length;  // exclusive
		while(true) {
			if (partStart <= 0) {
				let part = sizeStr.substring(0, partEnd);
				result = part + result;
				break;
			}

			let part = sizeStr.substring(partStart, partEnd);
			result = ', ' + part + result;

			partStart -= 3;
			partEnd -= 3;
		}

		return result;
	}
}

class ImageRenamer {
	private readonly pluginAPIs: PluginAPIs;

	constructor(pluginAPIs: PluginAPIs) {
		this.pluginAPIs = pluginAPIs;
	}

	// masterFile is the file who own and could link to the image
	// return void(renamed or needNotRename) or Error(sth unhappy happen, cant continue)
	public async tryRenameImage(imageFile: TFile, dotStartNewSuffixName: string, logSuccess: boolean = false, masterFile: TFile | null = null): Promise<void | Error> {
		if (this.pluginAPIs.settingsAPIs.isReadonly(this.pluginAPIs.sharedAPIs.obsidianAPIs.getFilePath_OSView(imageFile))) return;
		if (!dotStartNewSuffixName.startsWith('.')) return Error('dotStartNewSuffixName must start with .');
		let r = await this.retryableRenameImage_async(imageFile, dotStartNewSuffixName, masterFile);
		if (r instanceof Error) return r;
		if (logSuccess) {
			this.pluginAPIs.sharedAPIs.reportLog(
				`success to rename`,
				false, true, false, false
			);
		}
	}

	// return void(renamed or needNotRename) Error(sth unhappy happen, cant rename)
	// do NOT start to rename immediately, before start, it waits for an interval
	private async retryableRenameImage_async(
			imageFile: TFile,
			dotStartNewSuffixName: string,
			masterFile: TFile | null = null,
			first_try_interval_ms: number = 100,
			retry_interval_ms: number = 300,
			maxRetryTimes: number = 16): Promise<void | Error> {
		// wait a time
		await this.pluginAPIs.sharedAPIs.successAfterMs_async(first_try_interval_ms);
		let life = maxRetryTimes;
		let lastError;
		while (true) {
			if (life <= 0) {
				lastError.message = `failed to rename because: reach retry limit, \nlastError is: \n${lastError.message}`;
				return lastError;
			}
			// retry once
			try {
				life--;
				await this.doRenameImage_async(imageFile, dotStartNewSuffixName, masterFile);
				return;
			} catch (e) {
				lastError = e;
				// wait a time
				await this.pluginAPIs.sharedAPIs.successAfterMs_async(retry_interval_ms);
			}
		}
	}

	private async doRenameImage_async(imageFile: TFile, dotStartNewSuffixName: string, masterFile: TFile | null = null): Promise<void> {
		const spis = this.pluginAPIs.sharedAPIs;
		const opis = spis.obsidianAPIs;

		if (!masterFile) {
			const t = this.tryFindMasterFile(imageFile);
			if (!t) throw new Error(`cant determine name because: dont know owner`);
			masterFile = t;
		}

		const dirPath = opis.getFileParentDirectory_ObsidianView(imageFile);

		const date = new Date();
		const newName =
			opis.getFilePrefixName_ObsidianView(masterFile) +
			' - ' +
			`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}T${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}-${date.getMilliseconds()}` +
			dotStartNewSuffixName;

		const newPath =
			opis.concatDirectoryPathAndItemName_ObsidianView(
				dirPath, newName
			);

		// since in previous codes, know that the master file's link cache contain the link to image,
		//   so rename can auto-update the link to image in master file
		await opis.move_fileOrDirectory_async(imageFile, newPath);
	}

	// return TFile(found) null(cant found)
	private tryFindMasterFile(imageFile: TFile): TFile | null {
		let res: TFile | null = null;

		const spis = this.pluginAPIs.sharedAPIs;
		const opis = spis.obsidianAPIs;

		const curView = opis.getActiveMarkdownView();
		const curFile = curView.file;

		// is current editing file the master file?
		let currentFileIsMasterFile: boolean | undefined;

		// check link cache of current editing file
		// is current editing file contain link to image?
		const l = opis.tryGetInternalLinks(curFile);
		if (l) {
			const links = l;
			const anyLinkToImage = links.some(
				link => {
					const linkTargetOrNull = opis.tryGetLinkTarget(link.link, curFile.path);
					if (!linkTargetOrNull) return false;
					const linkTarget = linkTargetOrNull;
					return linkTarget.path == imageFile.path;
				}
			);
			currentFileIsMasterFile = anyLinkToImage;
		} else {
			currentFileIsMasterFile = false;
		}

		if (currentFileIsMasterFile) res = curFile;

		return res;
	}
}
