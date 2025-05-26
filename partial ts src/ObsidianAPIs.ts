import { SharedAPIs } from './SharedAPIs';
import { App, CachedMetadata, Editor, EmbedCache, FileManager, FileSystemAdapter, LinkCache, MarkdownView, MetadataCache, TAbstractFile, TFile, TFolder, Vault, Workspace, WorkspaceLeaf, normalizePath } from 'obsidian';

export class ObsidianAPIs {
	private readonly app: App;
	private readonly sharedAPIs: SharedAPIs;

	constructor(app: App, sharedAPIs: SharedAPIs) {
		this.app = app;
		this.sharedAPIs = sharedAPIs;
	}

	getApp(): App {
		return this.app;
	}

	getWorkspace(): Workspace {
		return this.getApp().workspace;
	}

	getVault(): Vault {
		return this.getApp().vault;
	}

	getFileManager(): FileManager {
		return this.getApp().fileManager;
	}

	getMetadataCache(): MetadataCache {
		return this.getApp().metadataCache;
	}

	getFileSystemAdapter(): FileSystemAdapter {
		var adapter = this.getVault().adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			this.sharedAPIs.reportLog('can NOT get FileSystemAdapter', true, false, true);
			throw new Error('report error');
		}
		return adapter;
	}

	getActiveMarkdownView(): MarkdownView {
		const view = this.getWorkspace().getActiveViewOfType(MarkdownView);
		if (!view) {
			this.sharedAPIs.reportLog('can NOT get active MarkdownView', true, false, true);
			throw new Error('report error');
		}
		return view;
	}

	getActiveMarkdownViewEditor(): Editor {
		return this.getActiveMarkdownView().editor;
	}

	async updateFile_async(file: TFile, callback: (fileContent: string) => string) {
		await this.getVault().process(file, callback);
	}

	async readFile_async(file: TFile): Promise<string> {
		return await this.getVault().read(file);
	}

	async readFileBinary_async(file: TFile): Promise<ArrayBuffer> {
		return await this.getVault().readBinary(file);
	}

	async writeFile_async(file: TFile, data: string) {
		await this.getVault().modify(file, data);
	}

	async writeFileBinary_async(file: TFile, data: ArrayBuffer) {
		await this.getVault().modifyBinary(file, data);
	}

	async deleteFile_async(file: TFile) {
		await this.getVault().delete(file);
	}

	async deleteFileIfExist_async(path: string) {
		var file = this.tryGetFile_ObsidianView(path);
		if (!file) return;
		await this.getVault().delete(file);
	}

	async deleteFiles_async(files: TFile[]) {
		await this.deleteFiles_body_async(files, 0);
	}

	private async deleteFiles_body_async(files: TFile[], cursor_deleteThisAndAllFollowing: number) {
		if (cursor_deleteThisAndAllFollowing >= files.length) return;

		var currentFile = files[cursor_deleteThisAndAllFollowing];
		await this.deleteFile_async(currentFile);
		await this.deleteFiles_body_async(files, cursor_deleteThisAndAllFollowing + 1);
	}

	async tryDeleteFiles_async(files: TFile[]) {
		await this.tryDeleteFiles_async_body(files, 0);
	}

	private async tryDeleteFiles_async_body(files: TFile[], cursor_deleteThisAndAllFollowing: number) {
		if (cursor_deleteThisAndAllFollowing >= files.length) return;

		var currentFile = files[cursor_deleteThisAndAllFollowing];
		try {
			await this.deleteFile_async(currentFile);
		} catch(error) {
			console.log(`failed to delete "${currentFile.name}" at "${currentFile.path}" because:`);
			console.log(error);
		}
		await this.deleteFiles_body_async(files, cursor_deleteThisAndAllFollowing + 1);
	}

	async createFile_async(path: string, content: string): Promise<TFile> {
		var file = this.tryGetFile_ObsidianView(path);
		if (file) {
			this.sharedAPIs.reportLog('want to create a file, but it already exist', true, false, true);
			throw new Error('report error');
		}
		return await this.getVault().create(path, content);
	}

	async createFileIfNOTExist_async(path: string, content: string): Promise<TFile> {
		var file = this.tryGetFile_ObsidianView(path);
		if (file) return file;
		return await this.getVault().create(path, content);
	}

	// [Workspace](https://docs.obsidian.md/Plugins/User+interface/Workspace)
	// [Workspace class](https://docs.obsidian.md/Reference/TypeScript+API/Workspace)
	// [Workspace.getLeaf() method](https://docs.obsidian.md/Reference/TypeScript+API/workspace/getLeaf_1)
	// split display all the childs
	// tabs display one of childs, at any moment
	async openFile_async(
		file: TFile
	) {
		let leaf: WorkspaceLeaf;

		// open file in new tab
		leaf = this.getWorkspace().getLeaf('tab');
		await leaf.openFile(file);
	
		// focus
		this.getWorkspace().setActiveLeaf(leaf, { focus: true });
	
		// source view
		const leafViewState = leaf.getViewState();
		await leaf.setViewState({
			...leafViewState,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			state: {
				...leafViewState.state,
				mode: 'source',
			},
		});
	}

	async createDirectoryIfNOTExist_async(path: string): Promise<void> {
		var dir = this.tryGetDirectory(path);
		if (dir) return;
		return await this.getVault().createFolder(path);
	}

	async createFolderIfNOTExist_async(path: string): Promise<void> {
		return await this.createDirectoryIfNOTExist_async(path);
	}

	// [Move file to other locations dynamically using callbacks](https://forum.obsidian.md/t/move-file-to-other-locations-dynamically-using-callbacks/64334)
	// change the path
	async move_fileOrDirectory_async(fileOrDirectory: TAbstractFile, newPath: string) {
		await this.getFileManager().renameFile(fileOrDirectory, newPath);
	}

	// rename a file
	async rename_fileOrDirectory_async(fileOrDirectory: TAbstractFile, newName: string) {
		if (newName.contains(this.getPathSeparator_ObsidianView())) {
			throw new Error('filename should NOT contain path-separator');
		}

		// parent
		var parentPath = fileOrDirectory.parent?.path;
		if (!parentPath) parentPath = '';
		// concat
		var newPath = this.concatDirectoryPathAndItemName_ObsidianView(
			parentPath, 
			newName
		);
		
		await this.move_fileOrDirectory_async(fileOrDirectory, newPath);
	}

	async renameFilePrefixName_async(file: TFile, newPrefix: string) {
		var suffix = this.getFileSuffixName_ObsidianView(file);
		if (!suffix.startsWith('.')) suffix = '.' + suffix;
		var newName = newPrefix + suffix;
		
		await this.rename_fileOrDirectory_async(file, newName);
	}

	async renameFileSuffixName_async(file: TFile, newSuffix: string) {
		if (!newSuffix.startsWith('.')) newSuffix = '.' + newSuffix;

		var prefix = this.getFilePrefixName_ObsidianView(file);
		var newName = prefix + newSuffix;
		
		await this.rename_fileOrDirectory_async(file, newName);
	}

	getAllLoadedFilesAndDirectories(): TAbstractFile[] {
		return this.getVault().getAllLoadedFiles();
	}

	getAllLoadedFiles(): TFile[] {
		return this.getAllLoadedFilesAndDirectories().flatMap<TFile>(
			fileOrDir => {
				if (fileOrDir instanceof TFile)
					return fileOrDir;
				return [];
			}
		);
	}

	getMarkdownFiles(): TFile[] {
		return this.getVault().getMarkdownFiles();
	}

	tryGetFileByLink(link: string, pathOfCurrentFile: string): TFile | null {
		return this.tryGetLinkTarget(link, pathOfCurrentFile);
	}

	// don't forget suffix .md
	tryGetFile_ObsidianView(pathObs: string): TFile | null {
		var file: TFile | null = null;
		var fileOrFolder = this.getVault().getAbstractFileByPath(pathObs);
		if (!fileOrFolder) return null;
		if (fileOrFolder instanceof TFile) {
			file = fileOrFolder;
		}
		return file;
	}

	getFile_ObsidianView(pathObs: string): TFile {
		var fileOrNull: TFile | null = this.tryGetFile_ObsidianView(pathObs);
		if (!fileOrNull) {
			this.sharedAPIs.reportLog('can NOT find file', true, false, true);
			throw new Error('report error');
		}
		var file = fileOrNull;
		return file;
	}

	tryGetFiles_ObsidianView(paths_ObsidianView: string[]): TFile[] | null {
		var result: TFile[] = [];
		for(var i=0; i<paths_ObsidianView.length; i++) {
			var path = paths_ObsidianView[i];
			var maybeFile = this.tryGetFile_ObsidianView(path);
			if (!maybeFile)
				return null;
			result.push(maybeFile);
		}
		return result;
	}

	getActiveFile(): TFile {
		var fileOrNull = this.getWorkspace().getActiveFile();
		if (!fileOrNull) {
			this.sharedAPIs.reportLog('can NOT find active file', true, false, true);
			throw new Error('report error');
		}
		return fileOrNull;
	}

	tryGetActiveFile(): TFile | null {
		return this.getWorkspace().getActiveFile();
	}

	tryGetFileMetadata(file: TFile): CachedMetadata | null {
		return this.getMetadataCache().getFileCache(file);
	}

	tryGetDirectory(path: string): TFolder | null {
		var folder: TFolder | null = null;
		var fileOrFolder = this.getVault().getAbstractFileByPath(path);
		if (!fileOrFolder) return null;
		if (fileOrFolder instanceof TFolder) {
			folder = fileOrFolder;
		}
		return folder;
	}

	// at current file, try to get the target of link
	tryGetLinkTarget(link: string, pathOfCurrentFile: string): TFile | null {
		return this.getMetadataCache().getFirstLinkpathDest(link, pathOfCurrentFile);
	}

	// at current file, generate the markdown link of target file
	generateMarkdownLink(targetFile: TFile, pathOfCurrentFile: string): string {
		return this.getFileManager().generateMarkdownLink(targetFile, pathOfCurrentFile);
	}

	// embed + non-embed links
	// if at least 1 link, return links, 
	// else return null
	tryGetInternalLinks(file: TFile): LinkCache[] | null {
		var links: LinkCache[] = [];
		var nonEmbeds = this.tryGetInternalNonEmbedLinks(file);
		if (nonEmbeds) links = links.concat(nonEmbeds);
		var embeds = this.tryGetInternalEmbedLinks(file);
		if (embeds) links = links.concat(embeds);
		if (links.length == 0) return null;
		return links;
	}

	// remove duplicate links, if link-text duplicate, which is [](link-text)
	// if at least 1 link, return links, 
	// else return null
	tryGetInternalLinksDistinctByLinkText(file: TFile): LinkCache[] | null {
		var links = this.tryGetInternalLinks(file);
		if (!links) return null;
		var linksDistinct: LinkCache[] = [];
		links.forEach(
			link => {
				if (!linksDistinct.some(
					addedLink => {
						return addedLink.link == link.link;
					}
				)) {
					linksDistinct.push(link);
				}
				return;
			}
		);
		if (linksDistinct.length == 0) return null;
		return linksDistinct;
	}

	// remove duplicate links, if link-text duplicate or target-of-link duplicate
	// if at least 1 link, return links, 
	// else return null
	tryGetInternalLinksDistinctByLinkTextAndTarget(file: TFile): LinkCache[] | null {
		var links = this.tryGetInternalLinksDistinctByLinkText(file);
		if (!links) return null;
		var linksDistinct: LinkCache[] = [];
		links.forEach(
			link => {
				var targetOfNonAdded = this.tryGetLinkTarget(link.link, file.path);
				if (!targetOfNonAdded) {
					linksDistinct.push(link);
					return;
				}
				if (!linksDistinct.some(
					addedLink => {
						var targetOfAdded = this.tryGetLinkTarget(addedLink.link, file.path);
						if (!targetOfAdded) return false;
						return targetOfAdded.path == targetOfNonAdded?.path;
					}
				)) {
					linksDistinct.push(link);
				}
				return;
			}
		);
		if (linksDistinct.length == 0) return null;
		return linksDistinct;
	}

	// do NOT contain embedded links like ![]()
	// if at least 1 link, return links, 
	// else return null
	tryGetInternalNonEmbedLinks(file: TFile): LinkCache[] | null {
		var metadata = this.tryGetFileMetadata(file);
		if (!metadata) return null;
		var links = metadata.links;
		if (!links || links.length == 0) return null;
		return links;
	}

	// links like ![]()
	// if at least 1 link, return links, 
	// else return null
	tryGetInternalEmbedLinks(file: TFile): EmbedCache[] | null {
		var metadata = this.tryGetFileMetadata(file);
		if (!metadata) return null;
		var embeds = metadata.embeds;
		if (!embeds || embeds.length == 0) return null;
		return embeds;
	}

	private sep: string = '';
	getPathSeparator_ObsidianView(): string {
		if (this.sep == '') {
			this.sep = this.normalizePath_ObsidianView('/');
			// if normalizePath_ObsidianView() do NOT tell me the separator
			if (this.sep == '') this.sep = '/';
			// check it before return
			if (!['/', '\\'].includes(this.sep)) {
				this.sharedAPIs.reportLog('the accquired path-separator is strange, it\'s ' + this.sep + ' , so stop the execution', true, false, true);
				throw new Error('report error');
			}
		}
		return this.sep;
	}

	normalizePath_ObsidianView(path: string): string {
		return normalizePath(path);
	}

	concatDirectoryPathAndItemName_ObsidianView(dirPath: string, fileOrDirName: string): string {
		let concated: string = '';
		// get path separator & normalize path
		const sep = this.getPathSeparator_ObsidianView();
		let dirPathAsPrefix = this.normalizePath_ObsidianView(dirPath);
		// is root dir?
		let rootDir = false;
		if (dirPathAsPrefix == '' || dirPathAsPrefix == sep) {
			rootDir = true;
		}
		// prepare prefix, the dir path
		if (rootDir) {
			dirPathAsPrefix = '';
		} else {
			if (!dirPathAsPrefix.endsWith(sep)) {
				dirPathAsPrefix += sep;
			}
		}
		// concat & normalize
		concated = this.normalizePath_ObsidianView(dirPathAsPrefix + fileOrDirName);
		// return
		return concated;
	}

	getFilePath_ObsidianView(file: TFile): string {
		return file.path;
	}

	getPathByDirectoryAndName_ObsidianView(dirObs: string, name: string): string {
		return this.concatDirectoryPathAndItemName_ObsidianView(dirObs, name);
	}

	getNeighborPath_ObsidianView(meFile: TFile, neighborName: string): string {
		return this.getPathByDirectoryAndName_ObsidianView(
			this.getFileParentDirectory_ObsidianView(meFile),
			neighborName
		);
	}

	getFileFolder_ObsidianView(file: TFile): string {
		return this.getFileParentDirectory_ObsidianView(file);
	}

	getFileParentDirectory_ObsidianView(file: TFile): string {
		const parent = file.parent;
		let dirPath = parent ? parent.path : '';
		dirPath = this.normalizePath_ObsidianView(dirPath);
		return dirPath;
	}

	getFileName_ObsidianView(file: TFile): string {
		return file.name;
	}

	getFileName_OSView(file: TFile): string {
		return this.sharedAPIs.getName_OSView(this.getFilePath_OSView(file));
	}

	getFilePrefixName_ObsidianView(file: TFile): string {
		return file.basename;
	}

	getFileSuffixName_ObsidianView(file: TFile): string {
		return file.extension;
	}

	// 123.png -> '.png'
	// 123. -> ''
	// 123 -> ''
	getFileDotStartSuffixName_ObsidianView(file: TFile): string {
		var suffixName = this.getFileSuffixName_ObsidianView(file);
		if (suffixName == '' || suffixName == '.') return '';
		if (!suffixName.startsWith('.')) suffixName = '.' + suffixName;
		return suffixName;
	}

	getFileSize(file: TFile): number {
		return file.stat.size;
	}

	getVaultPath_OSView(): string {
		var adapter = this.getFileSystemAdapter();
		var maybePath = adapter.getBasePath();
		maybePath = this.sharedAPIs.normalizePath_OSView(maybePath);
		return maybePath;
	}

	getFilePath_OSView(file: TFile): string {
		return this.getPath_OSView(file.path);
	}

	getPath_OSView(path_ObsidianView: string): string {
		var vaultPath_OSView = this.getVaultPath_OSView();
		var vaultToFile_OSView = path_ObsidianView;
		return this.sharedAPIs.concatPath_OSView([vaultPath_OSView, vaultToFile_OSView]);
	}

	isSamePath_ObsidianView(path1: string, path2: string): boolean {
		path1 = this.normalizePath_ObsidianView(path1);
		path2 = this.normalizePath_ObsidianView(path2);
		var sep = this.getPathSeparator_ObsidianView();
		if (path1.endsWith(sep)) path1 = path1.substring(0, path1.length - sep.length);
		if (path2.endsWith(sep)) path2 = path2.substring(0, path2.length - sep.length);
		return path1 == path2;
	}

	// 1s == 1000ms
	// m == 10^-3
	async waitUntilTFilesReady_async(paths_ObsidianView: string[], timeOut_ms: number = 3000, recheckInterval_ms: number = timeOut_ms / 10): Promise<TFile[]> {
		return new Promise<TFile[]>(
			(resolve, reject) => {
				const startDate = new Date();
				const startTime_ms = startDate.getTime();
				this.waitUntilTFilesReady_mainLoop_detached_resolveOrReject(
					paths_ObsidianView, 
					timeOut_ms, 
					recheckInterval_ms, 
					startTime_ms, 
					resolve, 
					reject
				);
			}
		);
	}

	private waitUntilTFilesReady_mainLoop_detached_resolveOrReject(
				paths_ObsidianView: string[], timeOut_ms: number, recheckInterval_ms: number, startTime_ms: number, 
				resolve:(value: TFile[] | PromiseLike<TFile[]>) => void, reject: (reason?: any) => void) {
		try {
			// check timeout
			// try
			// |-- ok! ------------------> resolve return
			// wait interval
			// loop
			// check time out
			const currentDate = new Date();
			const currentTime = currentDate.getTime();
			const isTimeOut = currentTime - startTime_ms > timeOut_ms;
			if (isTimeOut) {
				reject(`when wait TFiles to be ready, \ntime out, wait ${new Date().getTime() - startTime_ms} ms in total`);
				return;
			}

			// try
			const maybeAllTFiles = this.tryGetFiles_ObsidianView(paths_ObsidianView);
			if (maybeAllTFiles) {
				// ok!
				resolve(maybeAllTFiles);
				return;
			}

			// wait
			this.sharedAPIs.successAfterMs_async(recheckInterval_ms).then(
				() => {
					try {
						this.waitUntilTFilesReady_mainLoop_detached_resolveOrReject(
							paths_ObsidianView, 
							timeOut_ms, 
							recheckInterval_ms, 
							startTime_ms, 
							resolve, 
							reject
						);
					} catch(e) {
						reject(e);
					}
				}
			).catch(
				reason => {
					reject(reason);
				}
			);
		} catch(e) {
			reject(e);
		}
	}

	imageExts = ['.avif', '.jpeg', '.jpg', '.png', 'webp'];
	isImage(file: TFile): boolean {
		let name = this.getFileName_ObsidianView(file);
		let ext = this.getFileSuffixName_ObsidianView(file);
		if (ext.length <= 0 || ext.length >= name.length) {
			return false;
		}

		if (!ext.startsWith('.')) {
			ext = '.' + ext;
		}

		if (this.imageExts.includes(ext)) {
			return true;
		}
		return false;
	}

	getAllImageFiles(): TFile[] {
		return this.getAllLoadedFilesAndDirectories().flatMap<TFile>(
			(fileOrDir: TAbstractFile) => {
				if (fileOrDir instanceof TFile) {
					var file: TFile = fileOrDir;
					if (this.isImage(file)) {
						return file;
					}
				}
				return [];
			}
		)
	}

	normalizeResourceDirectoryPath_OSView(path: string): string {
		return this.sharedAPIs.normalizePath_OSView(path);
	}

	validResourceDirectoryName_OSView_TextTable(): string {
		return '0-9 a-z A-Z " _-"';
	}

	// empty -> false
	isValidResourceDirectoryName_OSView(name: string): boolean {
		if (name.length == 0) return false;
		// available char
		// a-z A-Z 0-9 ' ' '-' '_'
		var code0 = '0'.charCodeAt(0);
		var code9 = '9'.charCodeAt(0);
		var codeUA = 'A'.charCodeAt(0);
		var codeUZ = 'Z'.charCodeAt(0);
		var codela = 'a'.charCodeAt(0);
		var codelz = 'z'.charCodeAt(0);
		var codespace = ' '.charCodeAt(0);
		var codemidline = '-'.charCodeAt(0);
		var codelowline = '_'.charCodeAt(0);
		for (var i = 0; i < name.length; i++) {
			var ch = name[i];
			var code = ch.charCodeAt(0);
			if (!(	(codela <= code && code <= codelz) ||
				(codeUA <= code && code <= codeUZ) ||
				(code0 <= code && code <= code9) ||
				code == codespace ||
				code == codemidline ||
				code == codelowline			)		) {
				return false;
			}
		}
		return true;
	}

	validResourceDirectoryPath_OSView_TextTable(): string {
		return '0-9 a-z A-Z " _-" \\';
	}

	// empty -> false
	isValidResourceDirectoryPath_OSView(path: string): boolean {
		if (path.length == 0) return false;
		// available char
		// a-z A-Z 0-9 ' ' '-' '_' '\'
		var code0 = '0'.charCodeAt(0);
		var code9 = '9'.charCodeAt(0);
		var codeUA = 'A'.charCodeAt(0);
		var codeUZ = 'Z'.charCodeAt(0);
		var codela = 'a'.charCodeAt(0);
		var codelz = 'z'.charCodeAt(0);
		var codespace = ' '.charCodeAt(0);
		var codemidline = '-'.charCodeAt(0);
		var codelowline = '_'.charCodeAt(0);
		var coderightslash = '\\'.charCodeAt(0);
		for (var i = 0; i < path.length; i++) {
			var ch = path[i];
			var code = ch.charCodeAt(0);
			if (!(	(codela <= code && code <= codelz) ||
				(codeUA <= code && code <= codeUZ) ||
				(code0 <= code && code <= code9) ||
				code == codespace ||
				code == codemidline ||
				code == codelowline ||
				code == coderightslash       )		) {
				return false;
			}
		}
		return true;
	}
}
