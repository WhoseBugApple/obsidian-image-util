import { SharedAPIs } from "./SharedAPIs";

export class PathViewRecord {
	readonly path_ObsidianView: string;
	readonly path_OSView: string;

	constructor(path_ObsidianView: string, sharedAPIs: SharedAPIs) {
		this.path_ObsidianView = path_ObsidianView;
		this.path_OSView = sharedAPIs.obsidianAPIs.getPath_OSView(path_ObsidianView);
	}
}
