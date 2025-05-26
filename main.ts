import { ExecException, exec, spawn } from 'child_process';
import { access } from 'fs';
import { Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from 'partial ts src/DEFAULT_SETTINGS';
import { LimitedFunctionCall } from 'partial ts src/LimitedFunctionCall';
import { MapAndEntries } from 'partial ts src/MapAndEntries';
import { OneTaskOneTime } from 'partial ts src/OneTaskOneTime';
import { PathViewRecord } from 'partial ts src/PathViewRecord';
import { PluginSettings } from 'partial ts src/PluginSettings';
import { SettingTab } from 'partial ts src/SettingTab';
import { SharedAPIs } from './partial ts src/SharedAPIs';
import { pid } from 'process';
import {ObsidianAPIs} from "./partial ts src/ObsidianAPIs";
import {PluginAPIs} from "./partial ts src/PluginAPIs";

export default class KORCImageUtilPlugin extends Plugin {
	settings: PluginSettings;
	DEFAULT_SETTINGS: PluginSettings;
	pluginAPIs: PluginAPIs;
	sharedAPIs: SharedAPIs;
	obsidianAPIs: ObsidianAPIs;
	limitedFunctionCall: LimitedFunctionCall;
	// seriallyExecutor: SeriallyExecutor_ForPromise;
	oneMainTaskOneTime: OneTaskOneTime;
	oneCompressionTaskOneTime: OneTaskOneTime;
	oneCompressionAllTaskOneTime: OneTaskOneTime;
	oneCommandOneTime: OneTaskOneTime;

	async onload() {
		this.pluginAPIs = new PluginAPIs(this);
		this.sharedAPIs = this.pluginAPIs.sharedAPIs;
		this.obsidianAPIs = this.sharedAPIs.obsidianAPIs;

		this.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
		await this.loadSettings_async();
		this.addSettingTab(new SettingTab(this.app, this));

		this.limitedFunctionCall = new LimitedFunctionCall(this, 50);
		// this.seriallyExecutor = new SeriallyExecutor_ForPromise();
		this.oneMainTaskOneTime = new OneTaskOneTime();  // main task is NOT clearly defined, feel free
		this.oneCompressionTaskOneTime = new OneTaskOneTime();
		this.oneCompressionAllTaskOneTime = new OneTaskOneTime();

		this.oneCommandOneTime = new OneTaskOneTime();

		this.sharedAPIs.obsidianAPIs.getWorkspace().onLayoutReady(
			() => {
				this.registerEvent(this.sharedAPIs.obsidianAPIs.getVault().on("create",
					this.createFileOrDir_callback_async.bind(this)
				));
			}
		);

		this.addCommand({
			id: 'compress-all-images',
			name: 'Compress all images',
			callback: () => {
				this.tryCompressAllImagesInVault_command_async();
			}
		});

		this.addCommand({
			id: 'rename-images-in-current-file',
			name: 'Rename images in current-file',
			callback: () => {
				this.tryRenameImagesInCurrentFile_async();
			}
		});

		this.addCommand({
			id: 'fix-all-image-suffix-names',
			name: 'Fix all image-suffix-names',
			callback: () => {
				this.tryFixAllImageSuffixName_async();
			}
		});

		this.addCommand({
			id: 'report-image-files',
			name: 'Report images',
			callback: () => {
				this.command_reportImages_async();
			}
		});

		this.addCommand({
			id: 'move-image-files-into-pocket',
			name: 'Move images into owner\'s pocket',
			callback: () => {
				this.command_moveImagesPocket_async();
			}
		});

		// this.addCommand({
		// 	id: 'test',
		// 	name: 'test',
		// 	callback: () => {
		// 		this.testCommand();
		// 	}
		// });
	}
 
	onunload() {
		
	}

	// async testCommand() {
	// 	this.tryCompressAllImagesInVault_oneTaskOneTime();
	// }

	// await me to immediately return a async-function
	async idle_async() {}

	// path of obsidian view
	reportName: string = "korc images report.md";
	parentOfReport_path: string = "";
	reportPath: string = this.parentOfReport_path + this.reportName;
	async command_reportImages_async() {
		try {
			if (this.oneCommandOneTime.alreadyHasOneRunningTask()) return;
			this.oneCommandOneTime.knowATaskIsRunning();
		} catch (error) {
			return;
		}
		try {
			// idle
			await this.idle_async();

			// get image files
			const images: TFile[] = await this.sharedAPIs.obsidianAPIs.getAllImageFiles();
			if (images.length == 0) {
				new Notice('report finished, NO image is found');
				return;
			}

			// report
			await this.reportImages_async(images, this.reportPath, this.reportName, this.parentOfReport_path);
		} catch (error) {
			// ...
		} finally {
			this.oneCommandOneTime.knowThatTaskEnd();
		}
	}

	async reportImages_async(images: TFile[],
			reportFilePath: string, reportName: string, parentOfReport_path: string) {
		// delete report-file if exist
		await this.removeReportFile_async(reportFilePath);
		var emptyReportText: string = '';
		var reportText: string = this.getReportText(images, reportFilePath, emptyReportText);
		await this.handleReportText_async(reportFilePath, reportText, emptyReportText);
	}

	async removeReportFile_async(reportFilePath: string) {
		await this.sharedAPIs.obsidianAPIs.deleteFileIfExist_async(reportFilePath);
	}

	getReportText(
			images: TFile[], reportFilePath: string, emptyReportText: string): string {
		var reportText: string = emptyReportText;
		var mapAndEntries: MapAndEntries<string, TFile[]> = this.linkImageAndOwner(images, reportFilePath);
		reportText += this.getReportText_1Image1Owner(mapAndEntries, reportFilePath, emptyReportText);
		reportText += this.getReportText_imagesThatGetLostFromOwner(mapAndEntries, reportFilePath, emptyReportText);
		return reportText;
	}

	// path_of_image to owners
	linkImageAndOwner(images: TFile[], reportFilePath: string): MapAndEntries<string, TFile[]> {
		var apis = this.sharedAPIs;
		var opis = apis.obsidianAPIs;

		// map
		var mapAndEntries = new MapAndEntries<string, TFile[]>();
		images.forEach(image => mapAndEntries.entries.push(image.path));
		mapAndEntries.entries.forEach(entry => {
			mapAndEntries.map.set(entry, []);
		})

		// collect info for map
		// check each md file
		apis.obsidianAPIs.getMarkdownFiles().forEach((file, idx, files) => {
			// skip report file
			if (opis.isSamePath_ObsidianView(
				opis.getFilePath_ObsidianView(file), 
				reportFilePath
			)) return;

			// check each link
			opis.tryGetInternalLinksDistinctByLinkTextAndTarget(file)?.forEach((link, idx, links) => {
				// get path of target
				// now, mdFile -> link -> target -> target path
				var targetFile = opis.tryGetFileByLink(link.link, file.path);
				if (!targetFile) return;
				var targetPath = opis.getFilePath_ObsidianView(targetFile);

				// if mdFile link to those image, then ...
				if (mapAndEntries.map.has(targetPath)) {
					var owners = mapAndEntries.map.get(targetPath);
					if (owners == null) throw new Error('expect owners not null');
					owners.push(file);
				}
			});
		});

		return mapAndEntries;
	}

	getReportText_1Image1Owner(
			mapAndEntries: MapAndEntries<string, TFile[]>, reportFilePath: string, emptyReportText: string): string {
		var reportText: string = emptyReportText;

		reportText += this.getReportText_imagesThat2OrMoreOwner(mapAndEntries, this.reportPath, emptyReportText);
		reportText += this.getReportText_imagesThat0Owner(mapAndEntries, this.reportPath, emptyReportText);

		if (reportText != emptyReportText) {
			// if any report, add extra-info
			reportText = '# 1 image need exactly 1 owner\n' + reportText;
		}
		return reportText;
	}

	// should NOT 2-or-more note link to 1 image
	getReportText_imagesThat2OrMoreOwner(
			mapAndEntries: MapAndEntries<string, TFile[]>, reportFilePath: string, emptyReportText: string): string {
		var apis = this.sharedAPIs;
		var opis = apis.obsidianAPIs;

		var reportText: string = emptyReportText;

		// build up report text
		var badImageId = 1;
		mapAndEntries.entries.forEach(entry => {
			var imagePath = entry;
			var owners = mapAndEntries.map.get(entry);
			if (owners == null) throw new Error('expect owners not null');
			var ownerCount = owners.length;

			if (ownerCount >= 2) {
				// ill
				reportText += `### ${badImageId}\n`;
				var imageFile = opis.getFile_ObsidianView(imagePath);
				var imageMarkdownLink = opis.generateMarkdownLink(imageFile, reportFilePath);
				reportText += `#### bad image\n${imageMarkdownLink}\n\n`;
				reportText += `#### owners\n`;
				owners.forEach(owner => {
					var ownerMarkdownLink = opis.generateMarkdownLink(owner, reportFilePath);
					reportText += `${ownerMarkdownLink}\n\n`;
				});
				badImageId++;
			}
		});

		if (reportText != emptyReportText) {
			// if any report, add extra-info
			reportText = '## images that 2 or more owner\n' + reportText;
		}
		return reportText;
	}

	// should NOT no note link to 1 image
	getReportText_imagesThat0Owner(
			mapAndEntries: MapAndEntries<string, TFile[]>, reportFilePath: string, emptyReportText: string): string {
		var apis = this.sharedAPIs;
		var opis = apis.obsidianAPIs;

		var reportText: string = emptyReportText;

		// build up report text
		var badImageId = 1;
		mapAndEntries.entries.forEach(entry => {
			var imagePath = entry;
			var owners = mapAndEntries.map.get(entry);
			if (owners == null) throw new Error('expect owners not null');
			var ownerCount = owners.length;

			if (ownerCount == 0) {
				// ill
				reportText += `### ${badImageId}\n`;
				var imageFile = opis.getFile_ObsidianView(imagePath);
				var imageMarkdownLink = opis.generateMarkdownLink(imageFile, reportFilePath);
				reportText += `#### bad image\n${imageMarkdownLink}\n\n`;
				badImageId++;
			}
		});

		if (reportText != emptyReportText) {
			// if any report, add extra-info
			reportText = '## images that 0 owner\n' + reportText;
		}
		return reportText;
	}

	// should put images into owner's pocket
	getReportText_imagesThatGetLostFromOwner(
			mapAndEntries: MapAndEntries<string, TFile[]>, reportFilePath: string, emptyReportText: string): string {
		if (!this.pluginAPIs.validOwnerPocket()) return '';

		var apis = this.sharedAPIs;
		var opis = apis.obsidianAPIs;

		var reportText: string = emptyReportText;

		// build up report text
		var badImageId = 1;
		mapAndEntries.entries.forEach(entry => {
			var imagePath = entry;
			var owners = mapAndEntries.map.get(entry);
			if (owners == null) throw new Error('expect owners not null');
			var ownerCount = owners.length;

			if (ownerCount == 1) {
				var imageFile = opis.getFile_ObsidianView(imagePath);
				var owner = owners[0];
				if (this.isImageGetLostFromOwnerPocket(imageFile, owner)) {
					// ill
					reportText += `### ${badImageId}\n`;
					var imageMarkdownLink = opis.generateMarkdownLink(imageFile, reportFilePath);
					reportText += `#### bad image\n${imageMarkdownLink}\n\n`;
					reportText += `#### owner\n`;
					var ownerMarkdownLink = opis.generateMarkdownLink(owner, reportFilePath);
					reportText += `${ownerMarkdownLink}\n\n`;
					badImageId++;
				}
			}
		});

		if (reportText != emptyReportText) {
			// if any report, add extra-info
			reportText = '## images that get lost from owner\n' + reportText;
		}
		return reportText;
	}

	// call it only when owner pocket exist
	private isImageGetLostFromOwnerPocket(image: TFile, owner: TFile): boolean {
		const t = this.pluginAPIs.tryGetOwnerPocketPath_OSView(owner);
		if (typeof t != "string") throw new Error(
			`call this function is NOT allowed when cant find owner pocket${
				t != null ? ", cant find because " + t.message : ''
			}`
		);
		const ownerPocketPathOS = t;
		const imagePathOS = this.obsidianAPIs.getFilePath_OSView(image);
		const imageParentPath = this.sharedAPIs.getParentPath_OSView(imagePathOS);
		return !this.sharedAPIs.isSamePath_OSView(imageParentPath, ownerPocketPathOS);
	}

	async handleReportText_async(reportFilePath: string, reportText: string, emptyReportText: string) {
		if (reportText == emptyReportText) {
			new Notice("report finished, nothing to report");
			return;
		}
		var reportFile = await this.sharedAPIs.obsidianAPIs.createFile_async(reportFilePath, reportText);
		await this.sharedAPIs.obsidianAPIs.openFile_async(reportFile);
		new Notice("report finished, see report-file");
	}

	async tryFixAllImageSuffixName_async() {
		try {
			if (this.oneCommandOneTime.alreadyHasOneRunningTask()) return;
			this.oneCommandOneTime.knowATaskIsRunning();
		} catch (error) {
			return;
		}
		try {
			const images = this.sharedAPIs.obsidianAPIs.getAllImageFiles();
			let countModified = 0;
			for(let i=0; i<images.length; ++i) {
				const image = images[i];
				try {
					const isModified = await this.tryFixAImageSuffixName_async(image);
					if (isModified) countModified++;
				} catch(e) {
					this.sharedAPIs.reportLog(`can NOT fix ${image.name} at ${image.path}`, false, false, true, false);
				}
			}
			this.sharedAPIs.reportLog(`Fix Finished, \n${countModified} image-suffix-names are fixed`, false, true, true, false);
		} catch(error) {
			this.sharedAPIs.reportLog('Fix Interrupted', false, true, true, false);
			console.log(error);
		} finally {
			this.oneCommandOneTime.knowThatTaskEnd();
		}
	}

	// return is suffix changed
	tryFixAImageSuffixName_async(image: TFile): Promise<boolean> {
		return new Promise<boolean>(
			(resolve, reject) => {
				if (this.isImageReadonly(image)) {
					resolve(false);
					return;
				}

				var apis = this.sharedAPIs;
				var opis = apis.obsidianAPIs;

				opis.readFileBinary_async(image).then(
					data => {
						var bytes = data;
						var bytesArr = [bytes];
						var blob = new Blob(bytesArr, {
							"type": "image"
						});
						var fileReader = new FileReader();
						fileReader.onloadend = e => {
							try {
								var data = e.target?.result;
								if (!data || !(data instanceof ArrayBuffer)) throw new Error('can NOT read image as ArrayBuffer');
								var arr = (new Uint8Array(data)).subarray(0, 4);
								var header = "";
								for(var i = 0; i < arr.length; i++) {
									header += arr[i].toString(16).toUpperCase();
								}
								// Check the file signature against known types
								if (header.startsWith('FFD8')) {
									// jpeg
									// new Notice(`${image.name} is jpeg`);
									var jpegSuffix = '.jpeg';
									var curSuffix = opis.getFileDotStartSuffixName_ObsidianView(image);
									if (curSuffix != jpegSuffix) {
										this.sharedAPIs.obsidianAPIs.renameFileSuffixName_async(image, jpegSuffix).then(
											() => {
												console.log(`rename ${image.name} at ${image.path} suffix from ${curSuffix} to ${jpegSuffix}`);
												resolve(true);
											});
										return;
									} else {
										resolve(false);
										return;
									}
								} else if (header.startsWith('8950')) {
									// png
									// new Notice(`${image.name} is png`);
									var pngSuffix = '.png';
									var curSuffix = opis.getFileDotStartSuffixName_ObsidianView(image);
									if (curSuffix != pngSuffix) {
										this.sharedAPIs.obsidianAPIs.renameFileSuffixName_async(image, pngSuffix).then(
											() => {
												console.log(`rename ${image.name} at ${image.path} suffix from ${curSuffix} to ${pngSuffix}`);
												resolve(true);
											});
										return;
									} else {
										resolve(false);
										return;
									}
								} else {
									throw new Error(`unsupported image type, header is ${header}`);
								}
							} catch(e) {
								reject(e);
							}
						};
						fileReader.readAsArrayBuffer(blob);
					}
				)
			}
		)
	}

	async tryRenameImagesInCurrentFile_async() {
		try {
			if (this.oneCommandOneTime.alreadyHasOneRunningTask()) return;
			this.oneCommandOneTime.knowATaskIsRunning();
		} catch (error) {
			return;
		}
		try {
			const mdview = this.pluginAPIs.sharedAPIs.obsidianAPIs.getActiveMarkdownView();
			const curFile = mdview.file;
			const linksDistinct = this.pluginAPIs.sharedAPIs.obsidianAPIs.tryGetInternalLinksDistinctByLinkTextAndTarget(curFile);
			if (linksDistinct) {
				const images: TFile[] = [];
				linksDistinct.forEach(
					link => {
						const target = this.pluginAPIs.sharedAPIs.obsidianAPIs.tryGetLinkTarget(link.link, curFile.path);
						if (!target) return;
						if (!this.pluginAPIs.sharedAPIs.obsidianAPIs.isImage(target)) return;
						images.push(target);
					}
				);
				for(let i=0; i<images.length; i++) {
					const image = images[i];
					try {
						await this.pluginAPIs.compressAPIs.compressorRenamer.renamer.tryRenameImage(
							image,
							this.pluginAPIs.sharedAPIs.getDotStartSuffixName_OSView(this.pluginAPIs.sharedAPIs.obsidianAPIs.getFilePath_OSView(image)),
							true,
							curFile
						);
					} catch(e) {
						this.sharedAPIs.reportLog(`failed to rename "${image.name}" at "${image.path}" because: \n${e}`, false, true, true, false);
					}
				}
			}
			this.sharedAPIs.reportLog('Rename Finished', false, true, true);
		} catch(error) {
			this.sharedAPIs.reportLog('Rename Interrupted', false, true, true);
			console.log(error);
		} finally {
			this.oneCommandOneTime.knowThatTaskEnd();
		}
	}

	// if already task, abort
	// if no task, immediately start a new task, async completed
	async tryCompressAllImagesInVault_command_async() {
		try {
			if (this.oneCommandOneTime.alreadyHasOneRunningTask()) return;
			this.oneCommandOneTime.knowATaskIsRunning();
		} catch (error) {
			return;
		}
		try {
			const images = this.sharedAPIs.obsidianAPIs.getAllImageFiles();
			for(let i=0; i<images.length; ++i) {
				const image = images[i];
				try {
					const r = await this.pluginAPIs.compressAPIs.compressorRenamer.tryCompressImageThenRename_AloneExecute_async(image);
					if (r instanceof Error) { throw r; }
				} catch (e) {
					console.log(`can NOT compress "${image.name}" at "${image.path}" because:`);
					console.log(e);
				}
			}
			this.sharedAPIs.reportLog('Compression Finished', false, true, true, false);
		} catch(error) {
			this.sharedAPIs.reportLog('Compression Interrupted', false, true, true, false);
			console.log(error);
		} finally {
			this.oneCommandOneTime.knowThatTaskEnd();
		}
	}

	async createFileOrDir_callback_async(fileOrDir: TAbstractFile) {
		if (fileOrDir instanceof TFile) {
			await this.createFile_callback_async(fileOrDir);
		}
	}

	async createFile_callback_async(file: TFile) {
		if (this.sharedAPIs.obsidianAPIs.isImage(file)) {
			const imageFile: TFile = file;
			await this.createImageFile_callback_async(imageFile);
		}
	}

	async createImageFile_callback_async(imageFile: TFile) {
		if(this.oneCommandOneTime.alreadyHasOneRunningTask()) {
			await this.createImageWhenCommandRunning_callback_async(imageFile);
		} else {
			await this.createImageWhenNOCommand_callback_async(imageFile);
		}
	}

	async createImageWhenCommandRunning_callback_async(imageFile: TFile) {
		return;
	}

	async createImageWhenNOCommand_callback_async(imageFile: TFile): Promise<void> {
		if (!this.settings.compressAndRenameImageWhenPaste) return;
		await this.tryCompress_command_async(imageFile);
	}

	// if already task, abort
	// if reach recursion limit, abort
	// if no task, immediately start a new task, async completed
	async tryCompress_command_async(imageFile: TFile) {
		try {
			if (this.oneCommandOneTime.alreadyHasOneRunningTask()) return;
			this.oneCommandOneTime.knowATaskIsRunning();
		} catch (error) {
			return;
		}
		try {
			const r = await this.pluginAPIs.compressAPIs.compressorRenamer.tryCompressImageThenRename_AloneExecute_async(imageFile, true);
			if (r instanceof Error) { throw r; }
		} catch (e) {
			console.log(`can NOT compress "${imageFile.name}" at "${imageFile.path}" because:`);
			console.log(e);
		} finally {
			this.oneCommandOneTime.knowThatTaskEnd();
		}
	}

	// masterFile is the file who own and could link to the image
	// if NOT renamed throw error
	// do NOT start to rename immediately, before start, it wait for a interval
	async retryable_renameImage_async(
				imageFile: TFile,
				suffixName: string,
				masterFile: TFile | null = null,
				retry_interval_ms: number = 300,
				maxRetryTimes: number = 10){
		if (this.isImageReadonly(imageFile)) return;

		var life = maxRetryTimes;
		var lastError;
		while (true) {
			if (life <= 0) {
				this.sharedAPIs.reportLog(`failed to rename because: reach retry limit, \nlastError is: \n${lastError}`,
					true, false, false);
				throw new Error('report error');
			}
			life--;
			// wait a time
			await this.sharedAPIs.successAfterMs_async(retry_interval_ms);
			// retry once
			try {
				await this.renameImage_async(imageFile, suffixName, masterFile);
				return;
			} catch(e){
				lastError = e;
			}
		}
	}

	// masterFile is the file who own and could link to the image
	// if NOT renamed throw error
	async renameImage_async(imageFile: TFile, suffixName: string, masterFile: TFile | null = null) {
		if (this.isImageReadonly(imageFile)) throw new Error('try to rename readonly image');

		if (suffixName.length != 0 && !suffixName.startsWith('.')) suffixName = '.' + suffixName;

		var apis = this.sharedAPIs;
		var opis = apis.obsidianAPIs;

		if (!masterFile) {
			// find master file
			{
				// is current editing file the master file?
				var mdview = opis.getActiveMarkdownView();
				var editingFile = mdview.file;
				var currentFileIsMasterFile = false;
				{
					// check link cache of current editing file
					{
						var linksOrNull = opis.tryGetInternalLinks(editingFile);
						if (linksOrNull) {
							var links = linksOrNull;
							// is current editing file contain link to image
							var anyLinkToImage = links.some(
								link => {
									var linkTargetOrNull = opis.tryGetLinkTarget(link.link, editingFile.path);
									if (!linkTargetOrNull) return false;
									var linkTarget = linkTargetOrNull;
									return linkTarget.path == imageFile.path;
								}
							);
							if (anyLinkToImage) currentFileIsMasterFile = true;
						}
					}
				}

				if (currentFileIsMasterFile) masterFile = editingFile;

				if (!masterFile) {
					apis.reportLog("failed to rename image because: \ncan NOT determine the image name because: \ndo NOT know the file, who own the image",
						true, false, false);
					throw new Error('report error');
				}
			}
		}

		var dirPath = opis.getFileParentDirectory_ObsidianView(imageFile);

		var date = new Date();
		var newName =
			opis.getFilePrefixName_ObsidianView(masterFile) +
			' - ' +
			`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}T${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}-${date.getMilliseconds()}` +
			suffixName;

		var newPath =
			opis.concatDirectoryPathAndItemName_ObsidianView(
				dirPath, newName
			);

		// since in previous codes, know that the master file's link cache contain the link to image,
		//   so rename can auto-update the link to image in master file
		await opis.move_fileOrDirectory_async(imageFile, newPath);
	}

	runCanvas_async(file: TFile, suffixName: '.jpeg' | '.png', quality: number, blob: Blob): Promise<void> {
		return new Promise<void>(
			(resolve, reject) => {
				try {
					var apis = this.sharedAPIs;
					var plugin = this;

					var reader = new FileReader();
					reader.onload = function (event: ProgressEvent<FileReader>): any {
						try {
							var maybeDataURL = event.target?.result;
							if (!maybeDataURL || maybeDataURL instanceof ArrayBuffer) {
								apis.reportLog('expect read string, but NOT', true, false, true);
								throw new Error('report error');
							}
							// contains base64 data that represent a image
							var dataURL: string = maybeDataURL;
							// console.log(dataURL.toString());

							// [new Image() is equivalent to calling document.createElement('img'). - MDN web docs](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement)
							// [which is not attached to any DOM tree. - MDN web docs](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement)
							var image = new Image();
							image.onload = (event: Event) => {
								try {
									var canvas = document.createElement('canvas');
									var canvas2D = canvas.getContext('2d');
									if (!canvas2D) {
										apis.reportLog('canvas can NOT get canvas context', true, false, true);
										throw new Error('report error');
									}

									var imageWidth = image.width;
									var imageHeight = image.height;

									canvas.width = imageWidth;
									canvas.height = imageHeight;
									// canvas2D.fillStyle = '#fff';
									// canvas2D.fillRect(0, 0, imageWidth, imageHeight);
									canvas2D.drawImage(
										image,
										0, 0, imageWidth, imageHeight,
										0, 0, imageWidth, imageHeight);

									var mimeType = '';
									if (suffixName == '.jpeg') {
										mimeType = 'image/jpeg';
									} else if (suffixName == '.png') {
										mimeType = 'image/png';
										quality = 1;
									} else {
										throw new Error('can NOT determine mime type');
									}
									canvas.toBlob((blobOrNull: Blob | null) => {
										try {
											if (!blobOrNull) {
												apis.reportLog('canvas can NOT convert image to blob', true, false, true);
												throw new Error('report error');
											}
											var blob: Blob = blobOrNull;
											blob.arrayBuffer().then(
												(bytes: ArrayBuffer) => {
													var outFilePath_ObsidianView = plugin.getCanvasOutFilePath_ObsidianView(file, suffixName);
													apis.obsidianAPIs.createFileIfNOTExist_async(outFilePath_ObsidianView, '').then(
														(outFile: TFile) => {
															apis.obsidianAPIs.writeFileBinary_async(outFile, bytes).then(
																() => {
																	var outFile = apis.obsidianAPIs.tryGetFile_ObsidianView(outFilePath_ObsidianView);
																	if (!outFile) {
																		apis.reportLog('expect canvas output a file, but NOT', true, false, true);
																		throw new Error('report error');
																	}

																	resolve();
																}
															).catch(
																reason => {
																	apis.reportLog('canvas can NOT write to output file', true, false, true);
																	throw new Error('report error');
																}
															);
														}
													).catch(
														reason => {
															apis.reportLog('canvas can NOT createFileIfNOTExist', true, false, true);
															throw new Error('report error');
														}
													);
												}
											).catch(
												reason => {
													console.log(reason);
													apis.reportLog('canvas can NOT convert Blob to ArrayBuffer', true, false, true);
													throw new Error('report error');
												}
											);
										} catch(err) {
											reject(err);
										}
									}, mimeType, quality);
								} catch(err) {
									reject(err);
								}
							}
							image.src = dataURL;
						} catch(err) {
							reject(err);
						}
					};
					reader.readAsDataURL(blob);
				} catch (err) {
					reject(err);
				}
			}
		);
	}

	getCanvasOutFilePath_ObsidianView(inFile: TFile, suffixName: '.jpeg' | '.png'): string {
		var apis = this.sharedAPIs;

		var canvasNamePart = '-canvas';
		var outFileExtention = suffixName;
		var outFilePath_ObsidianView =
			apis.obsidianAPIs.concatDirectoryPathAndItemName_ObsidianView(
				apis.obsidianAPIs.getFileParentDirectory_ObsidianView(inFile),
				apis.obsidianAPIs.getFilePrefixName_ObsidianView(inFile) + canvasNamePart + outFileExtention);
		return outFilePath_ObsidianView;
	}

	getCanvasOutFilePath_OSView(outFilePath_ObsidianView: string): string {
		return this.sharedAPIs.obsidianAPIs.getPath_OSView(outFilePath_ObsidianView);
	}

	async command_moveImagesPocket_async() {
		try {
			if (this.oneCommandOneTime.alreadyHasOneRunningTask()) return;
			this.oneCommandOneTime.knowATaskIsRunning();
		} catch (error) {
			return;
		}
		try {
			// idle
			await this.idle_async();

			// move
			this.sharedAPIs.reportLog(`move start`, false, false, true, false);
			const countMoved = await this.moveImagesIntoPocket_async();
			this.sharedAPIs.reportLog(`move finished, ${countMoved} images is moved`, false, true, true, false);
		} catch (error) {
			// ...
		} finally {
			this.oneCommandOneTime.knowThatTaskEnd();
		}
	}

	async moveImagesIntoPocket_async(): Promise<number> {
		if (!this.pluginAPIs.validOwnerPocket()) {
			this.sharedAPIs.reportLog('abort. invalid image-directory-name', true, true, true, false);
			return 0;
		}

		var apis = this.sharedAPIs;
		var opis = apis.obsidianAPIs;

		// get images
		var images: TFile[] = await this.sharedAPIs.obsidianAPIs.getAllImageFiles();
		if (images.length == 0) {
			return 0;
		}

		var mapAndEntries: MapAndEntries<string, TFile[]> = this.linkImageAndOwner(images, this.reportPath);

		var countMoved = 0;
		var entries = mapAndEntries.entries;
		var entriesLen = entries.length;
		for (let i = 0; i < entriesLen; i++) {
			var entry = entries[i];
			var imagePath = entry;
			var owners = mapAndEntries.map.get(entry);
			if (owners == null) throw new Error('expect owners not null');
			var ownerCount = owners.length;

			if (ownerCount == 1) {
				var imageFile = opis.getFile_ObsidianView(imagePath);
				var owner = owners[0];
				const t = this.pluginAPIs.tryGetOwnerPocketPath_OSView(owner);
				if (typeof t != "string") return countMoved;
				const ownerPocketPath = t;
				if (this.isImageGetLostFromOwnerPocket(imageFile, owner)) {
					// ill
					var imageName = opis.getFileName_OSView(imageFile);
					imagePath = opis.getFilePath_ObsidianView(imageFile);
					var correctImagePath = this.pluginAPIs.getCorrectImageFullPath3(imageName, ownerPocketPath);
					apis.reportLog(`moving "${imageName}" \n to "${correctImagePath}" \n from "${imagePath}"`, false, false, true, false);
					await opis.createDirectoryIfNOTExist_async(ownerPocketPath);
					await opis.move_fileOrDirectory_async(imageFile, correctImagePath);
					apis.reportLog(`moved "${imageName}" \n to "${correctImagePath}" \n from "${imagePath}"`, false, false, true, false);
					countMoved++;
				}
			}
		}

		return countMoved;
	}

	async loadSettings_async() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	
	async saveSettings_async() {
		await this.saveData(this.settings);
	}

	isImageReadonly(image: TFile) {
		return this.pluginAPIs.settingsAPIs.isReadonly(this.sharedAPIs.obsidianAPIs.getFilePath_OSView(image));
	}
}
