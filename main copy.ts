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

export default class KORCImageUtilPlugin extends Plugin {
	settings: PluginSettings
	apis: SharedAPIs;
	limitedFunctionCall: LimitedFunctionCall;
	// seriallyExecutor: SeriallyExecutor_ForPromise;
	oneMainTaskOneTime: OneTaskOneTime;
	oneCompressionTaskOneTime: OneTaskOneTime;
	oneCompressionAllTaskOneTime: OneTaskOneTime;

	async onload() {
		this.apis = new SharedAPIs(this.app);

		await this.loadSettings_async();
		this.addSettingTab(new SettingTab(this.app, this));

		this.limitedFunctionCall = new LimitedFunctionCall(this, 50);
		// this.seriallyExecutor = new SeriallyExecutor_ForPromise();
		this.oneMainTaskOneTime = new OneTaskOneTime();  // main task is NOT clearly defined, feel free
		this.oneCompressionTaskOneTime = new OneTaskOneTime();
		this.oneCompressionAllTaskOneTime = new OneTaskOneTime();

		this.apis.obsidianAPIs.getWorkspace().onLayoutReady(
			() => {
				this.registerEvent(this.apis.obsidianAPIs.getVault().on("create", 
					this.createFileOrDir_callback_async.bind(this)
				));
			}
		);

		this.addCommand({
			id: 'compress-all-images',
			name: 'Compress all images',
			callback: () => {
				this.tryCompressAllImagesInVault_oneTaskOneTime_async(true);
			}
		});

		this.addCommand({
			id: 'rename-images-in-current-file',
			name: 'Rename images in current-file',
			callback: () => {
				this.tryRenameImagesInCurrentFile_async(true);
			}
		});

		this.addCommand({
			id: 'fix-all-image-suffix-names',
			name: 'Fix all image-suffix-names',
			callback: () => {
				this.tryFixAllImageSuffixName_async(true);
			}
		});

		this.addCommand({
			id: 'report-image-files',
			name: 'Report images',
			callback: () => {
				this.command_reportImages_async();
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
		// idle
		await this.idle_async();

		// get redirect files
		var images: TFile[] = await this.apis.obsidianAPIs.getAllImageFiles();
		if (images.length == 0) {
			new Notice('report finished, NO image is found');
			return;
		}
		
		// report
		await this.reportImages_async(images, this.reportPath, this.reportName, this.parentOfReport_path);
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
		await this.apis.obsidianAPIs.deleteFileIfExist_async(reportFilePath);
	}

	getReportText(
			images: TFile[], reportFilePath: string, emptyReportText: string): string {
		var reportText: string = emptyReportText;
		var mapAndEntries: MapAndEntries<string, TFile[]> = this.linkImageAndOwner(images);
		reportText += this.getReportText_1Image1Owner(mapAndEntries, reportFilePath, emptyReportText);
		return reportText;
	}

	// path_of_image to owners
	linkImageAndOwner(images: TFile[]): MapAndEntries<string, TFile[]> {
		var apis = this.apis;
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
		var apis = this.apis;
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
				var imageFile = opis.getFile(imagePath);
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
		var apis = this.apis;
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
				var imageFile = opis.getFile(imagePath);
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

	async handleReportText_async(reportFilePath: string, reportText: string, emptyReportText: string) {
		if (reportText == emptyReportText) {
			new Notice("report finished, nothing to report");
			return;
		}
		var reportFile = await this.apis.obsidianAPIs.createFile_async(reportFilePath, reportText);
		await this.apis.obsidianAPIs.openFile_async(reportFile);
		new Notice("report finished, see report-file");
	}

	async tryFixAllImageSuffixName_async(isMainTask: boolean = true) {
		try {
			if (isMainTask) {
				if (this.oneMainTaskOneTime.alreadyHasOneRunningTask()) {
					this.apis.reportLog('already exist a running main task', false, true, true);
					return;
				}
				this.oneMainTaskOneTime.knowATaskIsRunning();
			}

			const images = this.apis.obsidianAPIs.getAllImageFiles();
			var countModified = 0;
			for(var i=0; i<images.length; ++i) {
				var image = images[i];
				try {
					var isModified = await this.tryFixAImageSuffixName_async(image);
					if (isModified) countModified++;
				} catch(e) {
					this.apis.reportLog(`can NOT fix ${image.name} at ${image.path}`, false, false, true);
				}
			}
			this.apis.reportLog(`Fix Finished, \n${countModified} image-suffix-names are fixed`, false, true, true);
		} catch(error) {
			this.apis.reportLog('Fix Interrupted', false, true, true);
			console.log(error);
		} finally {
			if (isMainTask)
				if (this.oneMainTaskOneTime.alreadyHasOneRunningTask())
					this.oneMainTaskOneTime.knowThatTaskEnd();
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

				var apis = this.apis;
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
										this.apis.obsidianAPIs.renameFileSuffixName_async(image, jpegSuffix).then(
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
										this.apis.obsidianAPIs.renameFileSuffixName_async(image, pngSuffix).then(
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

	async tryRenameImagesInCurrentFile_async(isMainTask: boolean = true) {
		try {
			if (isMainTask) {
				if (this.oneMainTaskOneTime.alreadyHasOneRunningTask()) {
					this.apis.reportLog('already exist a running main task', false, true, true);
					return;
				}
				this.oneMainTaskOneTime.knowATaskIsRunning();
			}

			var apis = this.apis;
			var opis = apis.obsidianAPIs;

			var mdview = opis.getActiveMarkdownView();
			var file = mdview.file;
			var linksDistinct = opis.tryGetInternalLinksDistinctByLinkTextAndTarget(file);
			if (linksDistinct) {
				var images: TFile[] = [];
				linksDistinct.forEach(
					link => {
						var target = opis.tryGetLinkTarget(link.link, file.path);
						if (!target) return;
						if (!opis.isImage(target)) return;
						images.push(target);
					}
				);
				for(var i=0; i<images.length; i++) {
					var image = images[i];
					try {
						await this.retryable_renameImage_aysnc(image, image.extension, file);
					} catch(e) {
						this.apis.reportLog(`failed to rename "${image.name}" at "${image.path}" because: \n${e}`, false, true, true);
					}
				}
			}
			this.apis.reportLog('Rename Finished', false, true, true);
		} catch(error) {
			this.apis.reportLog('Rename Interrupted', false, true, true);
			console.log(error);
		} finally {
			if (isMainTask)
				if (this.oneMainTaskOneTime.alreadyHasOneRunningTask())
					this.oneMainTaskOneTime.knowThatTaskEnd();
		}
	}

	// if already task, abort
	// if no task, immediately start a new task, async completed
	async tryCompressAllImagesInVault_oneTaskOneTime_async(isMainTask: boolean = true) {
		try {
			if (isMainTask) {
				if (this.oneMainTaskOneTime.alreadyHasOneRunningTask()) {
					this.apis.reportLog('already exist a running main task', false, true, true);
					return;
				}
				this.oneMainTaskOneTime.knowATaskIsRunning();
			}

			if (this.oneCompressionAllTaskOneTime.alreadyHasOneRunningTask()) {
				this.apis.reportLog('already exist a running compression task', false, true, true);
				return;
			}
			this.oneCompressionAllTaskOneTime.knowATaskIsRunning();

			const images = this.apis.obsidianAPIs.getAllImageFiles();
			for(var i=0; i<images.length; ++i) {
				var image = images[i];
				await this.tryCompress_oneTaskOneTime_async(image, false, false).catch(
					e => {
						console.log(e);
						this.apis.reportLog(`can NOT compress ${image.name} at ${image.path}`, false, false, true);
					}
				);
			}
			this.apis.reportLog('Compression Finished', false, true, true);
		} catch(error) {
			this.apis.reportLog('Compression Interrupted', false, true, true);
			console.log(error);
		} finally {
			if (this.oneCompressionAllTaskOneTime.alreadyHasOneRunningTask())
				this.oneCompressionAllTaskOneTime.knowThatTaskEnd();
			if (isMainTask)
				if (this.oneMainTaskOneTime.alreadyHasOneRunningTask())
					this.oneMainTaskOneTime.knowThatTaskEnd();
		}
	}

	async createFileOrDir_callback_async(fileOrDir: TAbstractFile) {
		if (fileOrDir instanceof TFile) {
			await this.createFile_callback_async(fileOrDir);
		}
	}

	async createFile_callback_async(file: TFile) {
		if (this.apis.obsidianAPIs.isImage(file)) {
			var imageFile: TFile = file;
			await this.createImageFile_callback_async(imageFile);
		}
	}

	async createImageFile_callback_async(imageFile: TFile) {
		if(this.oneCompressionTaskOneTime.alreadyHasOneRunningTask()) {
			await this.createImageWhenCompressionTaskRunning_callback_async(imageFile);
		} else {
			await this.createImageWhenNOCompressionTask_callback_async(imageFile);
		}
	}

	async createImageWhenCompressionTaskRunning_callback_async(imageFile: TFile) {
		return;
	}

	async createImageWhenNOCompressionTask_callback_async(imageFile: TFile): Promise<void> {
		if (!this.settings.compressAndRenameImageWhenPaste) return;
		await this.tryCompress_oneTaskOneTime_async(imageFile, true, true);
	}

	// if already task, abort
	// if reach recursion limit, abort
	// if no task, immediately start a new task, async completed
	async tryCompress_oneTaskOneTime_async(imageFile: TFile, tryRename: boolean = true, isMainTask: boolean = true) {
		var outFilePaths: PathViewRecord[] = [];
		try {
			if (isMainTask) {
				if (this.oneMainTaskOneTime.alreadyHasOneRunningTask()) {
					this.apis.reportLog('already exist a running main task', false, true, true);
					return;
				}
				this.oneMainTaskOneTime.knowATaskIsRunning();
			}

			if (this.oneCompressionTaskOneTime.alreadyHasOneRunningTask()) {
				this.apis.reportLog('already exist a running compression task', true, false, true);
				return;
			}
			this.oneCompressionTaskOneTime.knowATaskIsRunning();

			this.limitedFunctionCall.ensureNoEndlessRecursion();

			if (this.isImageReadonly(imageFile)) return;

			var outFilePath;

			// canvas jpeg
			if (!this.settings.pngOnly) {
				await (this.tryCompressImageWithCanvas_async(imageFile, '.jpeg', 0.8).catch(
					reason => {
						this.apis.reportLog(`failed to compress using canvas because:`, false, false, true);
						console.log(reason);
					}
				));
				outFilePath = new PathViewRecord(
					this.getCanvasOutFilePath_ObsidianView(imageFile, '.jpeg'), 
					this.apis
				);
				if (await this.apis.exist_async(outFilePath.path_OSView)) {
					outFilePaths.push(outFilePath);
				}
			}

			// canvas png
			var isCanvasPngAvailable = false;
			var canvasPngOutFilePath: PathViewRecord | null = null;
			await (this.tryCompressImageWithCanvas_async(imageFile, '.png').catch(
				reason => {
					this.apis.reportLog(`failed to compress using canvas because:`, false, false, true);
					console.log(reason);
				}
			));
			outFilePath = new PathViewRecord(
				this.getCanvasOutFilePath_ObsidianView(imageFile, '.png'), 
				this.apis
			);
			if (await this.apis.exist_async(outFilePath.path_OSView)) {
				isCanvasPngAvailable = true;
				canvasPngOutFilePath = outFilePath;
				outFilePaths.push(outFilePath);
			}

			// ffmpeg png
			await (this.tryCompressImageWithFFMpeg_async(imageFile, '.png').catch(
				reason => {
					this.apis.reportLog(`failed to compress using ffmpeg because:`, false, false, true);
					console.log(reason);
				}
			));
			outFilePath = new PathViewRecord(
				this.getFFMpegOutFilePath_ObsidianView(imageFile, '.png'), 
				this.apis
			);
			if (await this.apis.exist_async(outFilePath.path_OSView)) {
				outFilePaths.push(outFilePath);
			}

			// ffmpeg jpeg
			if (!this.settings.pngOnly) {
				await (this.tryCompressImageWithFFMpeg_async(imageFile, '.jpeg').catch(
					reason => {
						this.apis.reportLog(`failed to compress using ffmpeg because:`, false, false, true);
						console.log(reason);
					}
				));
				outFilePath = new PathViewRecord(
					this.getFFMpegOutFilePath_ObsidianView(imageFile, '.jpeg'), 
					this.apis
				);
				if (await this.apis.exist_async(outFilePath.path_OSView)) {
					outFilePaths.push(outFilePath);
				}
			}

			// pngquant origin png true
			var isPngquantOriginTrueAvailable = false;
			await (this.tryCompressImageWithPNGQuant_async(imageFile, true).catch(
				reason => {
					this.apis.reportLog(`failed to compress using pngquant because:`, false, false, true);
					console.log(reason);
				}
			));
			outFilePath = new PathViewRecord(
				this.getPNGQuantOutFilePath_ObsidianView(imageFile, true), 
				this.apis
			);
			if (await this.apis.exist_async(outFilePath.path_OSView)) {
				isPngquantOriginTrueAvailable = true;
				outFilePaths.push(outFilePath);
			}

			// pngquant origin png false
			var isPngquantOriginFalseAvailable = false;
			await (this.tryCompressImageWithPNGQuant_async(imageFile, false).catch(
				reason => {
					this.apis.reportLog(`failed to compress using pngquant because:`, false, false, true);
					console.log(reason);
				}
			));
			outFilePath = new PathViewRecord(
				this.getPNGQuantOutFilePath_ObsidianView(imageFile, false), 
				this.apis
			);
			if (await this.apis.exist_async(outFilePath.path_OSView)) {
				isPngquantOriginFalseAvailable = true;
				outFilePaths.push(outFilePath);
			}

			if (!isPngquantOriginTrueAvailable && !isPngquantOriginFalseAvailable && isCanvasPngAvailable && canvasPngOutFilePath) {
				var canvasPngOut: TFile = (await this.apis.obsidianAPIs.waitUntilTFilesReady_async(
					[canvasPngOutFilePath.path_ObsidianView], 
					3000
				))[0]

				// pngquant origin png true
				await (this.tryCompressImageWithPNGQuant_async(canvasPngOut, true).catch(
					reason => {
						this.apis.reportLog(`failed to compress using pngquant because:`, false, false, true);
						console.log(reason);
					}
				));
				outFilePath = new PathViewRecord(
					this.getPNGQuantOutFilePath_ObsidianView(canvasPngOut, true), 
					this.apis
				);
				if (await this.apis.exist_async(outFilePath.path_OSView)) {
					outFilePaths.push(outFilePath);
				}

				// pngquant origin png false
				await (this.tryCompressImageWithPNGQuant_async(canvasPngOut, false).catch(
					reason => {
						this.apis.reportLog(`failed to compress using pngquant because:`, false, false, true);
						console.log(reason);
					}
				));
				outFilePath = new PathViewRecord(
					this.getPNGQuantOutFilePath_ObsidianView(canvasPngOut, false), 
					this.apis
				);
				if (await this.apis.exist_async(outFilePath.path_OSView)) {
					outFilePaths.push(outFilePath);
				}
			}

			var bestOutFilePath = await this.selectBestImage_async(outFilePaths);

			await this.logFiles_compressionLog_async(imageFile, outFilePaths, bestOutFilePath);

			var isReplaced = await this.replaceInputFile_ifOutFileIsBetter_async(imageFile, bestOutFilePath.path_OSView);
			await this.cleanOutFiles_async(outFilePaths);

			// rename related
			if (tryRename) {
				var newSuffixName: string = '';
				if (isReplaced) {
					var bestOutFileSuffixName = this.apis.getSuffixName_OSView(bestOutFilePath.path_OSView);
					newSuffixName = bestOutFileSuffixName;
				} else {
					newSuffixName = this.apis.obsidianAPIs.getFileSuffixName_ObsidianView(imageFile);
				}
				// try to rename
				// detached, no await
				// this.retryable_renameImage_aysnc(imageFile, newSuffixName).catch(e => {
				// 	this.apis.reportLog(e.toString(), false, true, true);
				// });
				try {
					await this.retryable_renameImage_aysnc(imageFile, newSuffixName);
					this.apis.reportLog(
						`success to rename`, 
						false, true, false
					);
				} catch(e) {
					this.apis.reportLog(e.toString(), false, true, true);
				}
			}
		} catch(error) {
			await this.cleanOutFiles_async(outFilePaths);
			this.apis.reportLog('Compression Interrupted', false, true, true);
			console.log(error);
		} finally {
			if (this.oneCompressionTaskOneTime.alreadyHasOneRunningTask())
				this.oneCompressionTaskOneTime.knowThatTaskEnd();
			if (isMainTask)
				if (this.oneMainTaskOneTime.alreadyHasOneRunningTask())
					this.oneMainTaskOneTime.knowThatTaskEnd();
		}
	}

	// masterFile is the file who own and could link to the image
	// if NOT renamed throw error
	// do NOT start to rename immediately, before start, it wait for a interval
	async retryable_renameImage_aysnc(
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
				this.apis.reportLog(`failed to rename because: reach retry limit, \nlastError is: \n${lastError}`, 
					true, false, false);
				throw new Error('report error');
			}
			life--;
			// wait a time
			await this.apis.successAfterMs_async(retry_interval_ms);
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

		var apis = this.apis;
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

		var dirPath = opis.getFileDirectory_ObsidianView(imageFile);

		var date = new Date();
		var newName = 
			opis.getFilePrefixName_ObsidianView(masterFile) + 
			' - ' + 
			`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}T${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}-${date.getMilliseconds()}` + 
			suffixName;
		
		var newPath = 
			opis.concatDirectoryPathAndFileName_ObsidianView(
				dirPath, newName
			);
		
		// since in previous codes, know that the master file's link cache contain the link to image, 
		//   so rename can auto-update the link to image in master file
		await opis.move_fileOrDirectory_async(imageFile, newPath);
	}

	// https://pngquant.org/
	// https://manpages.debian.org/testing/pngquant/pngquant.1.en.html
	// dithering: use more color in pattle, so that have a smoother nicer gradient-color
	async tryCompressImageWithPNGQuant_async(file: TFile, enableDithering: boolean = true): Promise<void> {
		var apis = this.apis;

		var outFilePath_ObsidianView = this.getPNGQuantOutFilePath_ObsidianView(file, enableDithering);
		await apis.obsidianAPIs.deleteFileIfExist_async(outFilePath_ObsidianView);
		var inFilePath_OSView = apis.obsidianAPIs.getFilePath_OSView(file);
		var outFilePath_OSView = apis.obsidianAPIs.getPath_OSView(outFilePath_ObsidianView);

		await this.tryExecPNGQuant_async(inFilePath_OSView, outFilePath_OSView, enableDithering);
	}

	getPNGQuantOutFilePath_ObsidianView(inFile: TFile, enableDithering: boolean): string {
		var apis = this.apis;

		var pngQuantNamePart = '-pngquant';
		var ditheringInfoNamePart = enableDithering ? '-dithering' : '-nodithering';
		var outFileExtention = '.png';
		var outFilePath_ObsidianView = 
			apis.obsidianAPIs.concatDirectoryPathAndFileName_ObsidianView(
				apis.obsidianAPIs.getFileDirectory_ObsidianView(inFile), 
				apis.obsidianAPIs.getFilePrefixName_ObsidianView(inFile) + pngQuantNamePart + ditheringInfoNamePart + outFileExtention
			);
		return outFilePath_ObsidianView;
	}

	getPNGQuantOutFilePath_OSView(outFilePath_ObsidianView: string): string {
		return this.apis.obsidianAPIs.getPath_OSView(outFilePath_ObsidianView);
	}

	private tryExecPNGQuant_async(inFilePath_OSView: string, outFilePath_OSView: string, enableDithering: boolean): Promise<void> {
		return new Promise<void>(
			(resolve, reject) => {
				try{
					var apis = this.apis;
		
					var command = `pngquant.exe --skip-if-larger ${enableDithering ? '' : '--ordered'} --speed=1 --quality=45-85 "--output=${outFilePath_OSView}" "${inFilePath_OSView}"`;
					exec(command, (error: ExecException, stdout: string, stderr: string) => {
						try {
							if (error) {
								apis.reportLog('pngquant error', false, false, true);
								reject(error);
								return;
							}
			
							access(outFilePath_OSView, (err) => {
								try {
									if (err) {
										apis.reportLog('expect pngquant output a file, but NOT', false, false, true);
										reject(err);
										return;
									}
				
									resolve();
								} catch(error) {
									reject(error);
								}
							});
						} catch(error) {
							reject(error);
						}
					});
				} catch (error) {
					reject(error);
				}
			}
		);
	}

	async tryCompressImageWithFFMpeg_async(file: TFile, format: '.png' | '.jpeg'): Promise<void> {
		var apis = this.apis;

		var outFilePath_ObsidianView = this.getFFMpegOutFilePath_ObsidianView(file, format);
		await apis.obsidianAPIs.deleteFileIfExist_async(outFilePath_ObsidianView);
		var inFilePath_OSView = apis.obsidianAPIs.getFilePath_OSView(file);
		var outFilePath_OSView = apis.obsidianAPIs.getPath_OSView(outFilePath_ObsidianView);

		await this.tryExecFFMpeg_async(inFilePath_OSView, outFilePath_OSView);
		// await this.spawnFFMpeg(inFilePath, outFilePath);
	}

	getFFMpegOutFilePath_ObsidianView(inFile: TFile, format: '.png' | '.jpeg'): string {
		var apis = this.apis;

		var ffmpegNamePart = '-ffmpeg';
		var outFileExtention = format;
		var outFilePath_ObsidianView = 
			apis.obsidianAPIs.concatDirectoryPathAndFileName_ObsidianView(
				apis.obsidianAPIs.getFileDirectory_ObsidianView(inFile), 
				apis.obsidianAPIs.getFilePrefixName_ObsidianView(inFile) + ffmpegNamePart + outFileExtention
			);
		return outFilePath_ObsidianView;
	}

	getFFMpegOutFilePath_OSView(outFilePath_ObsidianView: string): string {
		return this.apis.obsidianAPIs.getPath_OSView(outFilePath_ObsidianView);
	}

	private tryExecFFMpeg_async(inFilePath_OSView: string, outFilePath_OSView: string): Promise<void> {
		return new Promise<void>(
			(resolve, reject) => {
				try {
					var apis = this.apis;

					var command = `ffmpeg -nostdin -i "${inFilePath_OSView}" -compression_level 100 -qscale:v 4 "${outFilePath_OSView}"`;
					exec(command, (error: ExecException, stdout: string, stderr: string) => {
						try {
							if (error) {
								console.log(error);
								apis.reportLog('ffmpeg error', true, false, true);
								throw new Error('report error');
							}

							access(outFilePath_OSView, (err) => {
								try {
									if (err) {
										console.log(err);
										apis.reportLog('expect ffmpeg output a file, but NOT', true, false, true);
										throw new Error('report error');
									}

									resolve();
								} catch(err) {
									reject(err);
								}
							});
						} catch(err) {
							reject(err);
						}
					});
				} catch(err) {
					reject(err);
				}
			}
		);
	}

	private spawnFFMpeg_async(inFilePath_OSView: string, outFilePath_OSView: string): Promise<void> {
		return new Promise<void>(
			(resolve, reject) => {
				try {
					var apis = this.apis;

					var executable = 'ffmpeg';
					var args = [
						'-nostdin', 
						'-i', inFilePath_OSView, 
						'-compression_level', '100', 
						'-qscale:v', '4', 
						outFilePath_OSView
					];
					var process = spawn(executable, args);
					process.on('close', (code: number | null) => {
						try {
							if (code && code >= 1) {
								apis.reportLog('ffmpeg return code >= 1', true, false, true);
								throw new Error('report error');
							}

							access(outFilePath_OSView, (err) => {
								try {
									if (err) {
										console.log(err);
										apis.reportLog('expect ffmpeg output a file, but NOT', true, false, true);
										throw new Error('report error');
									}

									resolve();
								} catch(err) {
									reject(err);
								}
							});
						} catch(err) {
							reject(err);
						}
					});
				} catch(err) {
					reject(err);
				}
			}
		);
	}

	// quality [between 0 and 1 - MDN web docs](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
	async tryCompressImageWithCanvas_async(file: TFile, suffixName: '.jpeg' | '.png', quality: number = 0.8): Promise<void> {
		var apis = this.apis;

		var bytes = await apis.obsidianAPIs.readFileBinary_async(file);
		var bytesArr = [bytes];
		var blob = new Blob(bytesArr, {
			"type": "image"
		});
		
		await this.runCanvas_async(file, suffixName, quality, blob);
	}

	runCanvas_async(file: TFile, suffixName: '.jpeg' | '.png', quality: number, blob: Blob): Promise<void> {
		return new Promise<void>(
			(resolve, reject) => {
				try {
					var apis = this.apis;
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
																	var outFile = apis.obsidianAPIs.tryGetFile(outFilePath_ObsidianView);
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
		var apis = this.apis;

		var canvasNamePart = '-canvas';
		var outFileExtention = suffixName;
		var outFilePath_ObsidianView = 
			apis.obsidianAPIs.concatDirectoryPathAndFileName_ObsidianView(
				apis.obsidianAPIs.getFileDirectory_ObsidianView(inFile), 
				apis.obsidianAPIs.getFilePrefixName_ObsidianView(inFile) + canvasNamePart + outFileExtention);
		return outFilePath_ObsidianView;
	}

	getCanvasOutFilePath_OSView(outFilePath_ObsidianView: string): string {
		return this.apis.obsidianAPIs.getPath_OSView(outFilePath_ObsidianView);
	}

	async selectBestImage_async(candidateImagePaths: PathViewRecord[], strategy: 'min size' = 'min size'): Promise<PathViewRecord> {
		if (strategy == 'min size') {
			return await this.selectBestImage_selectMinSize_async(candidateImagePaths);
		}

		this.apis.reportLog(`when select best image, there is no such strategy: ${strategy}`, true, false, true);
		throw new Error('report error');
	}

	private async selectBestImage_selectMinSize_async(candidateImagePaths: PathViewRecord[]): Promise<PathViewRecord> {
		var apis = this.apis;

		if (candidateImagePaths.length == 0) {
			apis.reportLog('there is no candidate image', true, false, true);
			throw new Error('report error');
		}

		var paths = candidateImagePaths;  // alias
		var minSize_index = 0;  // when finding it's current found min, after finding it's min of all
		var minSize = await apis.getSize_async(paths[minSize_index].path_OSView);
		for(var i=1; i<candidateImagePaths.length; i++) {
			var currentSize = await apis.getSize_async(paths[i].path_OSView);
			if (currentSize < minSize) {
				minSize_index = i;
				minSize = currentSize;
			}
		}
		return paths[minSize_index];
	}

	async logFiles_compressionLog_async(inFile: TFile, outFilePaths: PathViewRecord[], bestOutFilePath: PathViewRecord) {
		var apis = this.apis;

		console.log('in file:');
		console.log(inFile);
		console.log('out file paths:');
		console.log(outFilePaths);
		console.log('best out file path:');
		console.log(bestOutFilePath);

		apis.reportLog(
			`in file:\n` + 
			`- name: ${apis.obsidianAPIs.getFileName_ObsidianView(inFile)}\n` + 
			`- size: ${apis.obsidianAPIs.getFileSize(inFile)}\n` + 
			`out files:\n` + 
			`- count: ${outFilePaths.length}\n` + 
			`best out file:\n` + 
			`- name: ${apis.getName_OSView(bestOutFilePath.path_OSView)}\n` + 
			`- size: ${this.fileSizeToReadableFileSize(await apis.getSize_async(bestOutFilePath.path_OSView))}\n`, 
			false, true, true
		);
	}

	// return is replaced
	async replaceInputFile_ifOutFileIsBetter_async(inFile: TFile, outFilePath_OSView: string): Promise<boolean> {
		var apis = this.apis;

		var inSize = apis.obsidianAPIs.getFileSize(inFile);
		var outSize = await apis.getSize_async(outFilePath_OSView);
		if (outSize < inSize) {
			var outBytes = await apis.readBytes_async(outFilePath_OSView);
			await apis.obsidianAPIs.writeFileBinary_async(inFile, outBytes);
			return true;
		}
		return false;
	}

	async cleanOutFiles_async(outFilePaths: PathViewRecord[]) {
		var outFilePaths_ObsidianView: string[] = outFilePaths.map(
			path => path.path_ObsidianView
		)
		var files = await this.apis.obsidianAPIs.waitUntilTFilesReady_async(
			outFilePaths_ObsidianView, 
			3000, 
			300
		);
		await this.apis.obsidianAPIs.tryDeleteFiles_async(files);
	}

	async loadSettings_async() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	
	async saveSettings_async() {
		await this.saveData(this.settings);
	}

	isImageReadonly(image: TFile) {
		var filename = this.apis.obsidianAPIs.getFileName_ObsidianView(image).toLowerCase();
		var readonlyMark = this.settings.readonlyMark.toLowerCase();
		return filename.contains(readonlyMark);
	}

	fileSizeToReadableFileSize(size: number): string {
		var result: string = '';
		var sizeStr = size.toString();

		var partStart = sizeStr.length - 3;
		var partEnd = sizeStr.length;  // exclusive
		while(true) {
			if (partStart <= 0) {
				var part = sizeStr.substring(0, partEnd);
				result = part + result;
				break;
			}

			var part = sizeStr.substring(partStart, partEnd);
			result = ', ' + part + result;
			
			partStart -= 3;
			partEnd -= 3;
		}

		return result;
	}
}
