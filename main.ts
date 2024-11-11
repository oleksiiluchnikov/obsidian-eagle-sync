import { Plugin, WorkspaceLeaf, TFile} from 'obsidian';
import { ExampleView, EAGLE_SYNC_VIEW } from './view';
import { EagleClient } from '@petamorikei/eagle-js';
import { GetItemListResult } from '@petamorikei/eagle-js/dist/types';
// import { getAPI } from 'obsidian-dataview';

const DEFAULT_SETTINGS: EagleSyncSettings = {
	mySetting: 'default',
	eagleAPIServerUrl: 'http://localhost:41595',
	eagleAPIServerToken: '',
	fieldEagleFolder: 'eagle_folder_id'
}

const EAGLE_FOLDER_ID_REGEX = new RegExp('[A-Z0-9]{13}', 'g');
export const EAGLE_CLIENT = EagleClient.instance;

export type EagleFolderID = string;
export type EagleItemID = string; // UUID, e.g. A0B1C2D3E4F5G6H7
export type Styles = {
    depth: number;
    first: boolean;
    last: boolean;
};

export type EagleFolderInfoData = {
    id: EagleFolderID;
    name: string;
    description: string;
    children: EagleFolderInfoData[]; // assuming children are of the same type
    modificationTime: number;
    tags: string[];
    iconColor: string;
    password: string;
    passwordTips: string;
    parent: string;
    isExpand: boolean;
    images: string[];
    size: number;
    vstype: string;
    styles: Styles;
    isVisible: boolean;
    imagesMappings: Record<string, unknown>; // assuming that we don't know the structure of the objects in the imagesMappings
    imageCount: number;
    descendantImageCount: number;
    pinyin: string;
    extendTags: string[];
    covers: string[];
    index: number;
    $$hashKey: string;
    newFolderName: string;
};

interface EagleSyncSettings {
	mySetting: string;
	eagleAPIServerUrl: string;
	eagleAPIServerToken: string;
	fieldEagleFolder: string;
}


async function fetchValue(content: string, metadataKey: string, valueRegex: RegExp): Promise<string | null> {
	const line = content.split('\n')
		.filter((line) => {
			if (line === undefined) return false;
			return (line.includes(`${metadataKey}::`) || line.startsWith(`${metadataKey}:`))
		})[0];
	if (!line) return null;
	const match = line.match(valueRegex);
	if (!match) return null;
	return match[0];
}

async function checkEagleServerStatus(): Promise<boolean> {
	const requestUrl = `${DEFAULT_SETTINGS.eagleAPIServerUrl}/api/application/info`;
	const requestOptions: RequestInit = {
		method: 'GET',
		redirect: 'follow'
	};
	try {
		const response = await fetch(requestUrl, requestOptions);
		const result = await response.json();
		if (result.status === 'success') {
			return true;
		}
	} catch (error) {
		console.error('Error checking Eagle server status:', error);
	}
	return false;
}

async function fetchItemsListFromFolder(foldersList: EagleFolderID[]): Promise<GetItemListResult | null> {
	const data = {
		limit: 300,
		folders: foldersList,
	};
	const response = await EAGLE_CLIENT.getItemList(data);
	if (!response) return null;
	if (response.status !== 'success') {
		return null;
	}
	return response
}

/**
 * Recursive function to find the folder with a matching ID.
 *
 * @param folderID - The ID of the folder to find.
 * @param data - The data to search in.
 * @returns The matching folder, or null if no match was found.
 */
function findFolder(folderID: EagleFolderID, data: any): any {
	// if (!data || typeof data.id === 'undefined') {
	// 	throw new Error("Invalid data provided");
	// }

	// if (data.children) {
	// 	console.log(data.children.length);
	// 	for (let i = 0; i < data.children.length; i++) {
	// 		const result = findFolder(folderID, data.children[i]);
	// 		if (result) {
	// 			return result;
	// 		}
	// 	}
	// }
	for (let i = 0; i < data.length; i++) {
		if (data[i].id === folderID) {
			return data[i];
		} else if (data[i].children) {
			const result = findFolder(folderID, data[i].children);
			if (result) {
				return result;
			}
		}
	}

	return null;
}

async function fetchEagleFolderTags(folderID: EagleFolderID): Promise<string[] | null> {
	const response = await EAGLE_CLIENT.getFolderList();
	if (!response) return null;
	if (response.status !== 'success') {
		return null;
	}
	let tags: string[] = [];
	try {
		const folder = findFolder(folderID, response.data);
		tags = folder.extendTags;
	} catch (error) {
		console.error(error);
	}
		return tags;
}

async function fetchPageTags(page: TFile): Promise<string[] | null> {
	const tags = await this.app.metadataCache.getFileCache(page)?.tags;
	if (!tags) return null;
	const tagsArray: string[] = [];
	for (let i = 0; i < tags.length; i++) {
		tagsArray.push(tags[i].tag);
	}
	return tagsArray;
}


function formatTagForPage(tag: string): string {
	return `#${tag}`;
}

function formatTagsForPage(tags: string[]): string[] {
	const formattedTags: string[] = [];
	for (let i = 0; i < tags.length; i++) {
		formattedTags.push(formatTagForPage(tags[i]));
	}
	return formattedTags;
}

function formatTagForEagle(tag: string): string {
	return tag.replace('#', '');
}

function formatTagsForEagle(tags: string[]): string[] {
	const formattedTags: string[] = [];
	for (let i = 0; i < tags.length; i++) {
		formattedTags.push(formatTagForEagle(tags[i]));
	}
	return formattedTags;
}

async function updateFolderTags(folderID: EagleFolderID, tags: string[]): Promise<void> {
	const data = {
		folderId: folderID,
		newDescription: tags.join(', '),
	};
	const response = await EAGLE_CLIENT.updateFolder(data);
	console.log(response);
	if (!response) return;
	if (response.status !== 'success') {
		console.error(response);
	}

}

async function syncTags(page: TFile, folderID: EagleFolderID): Promise<void> {
	const pageTags = await fetchPageTags(page);
	if (!pageTags) return;
	const formattedPageTags = formatTagsForEagle(pageTags);
	const folderTags = await fetchEagleFolderTags(folderID);
	if (!folderTags) return;
	const formattedFolderTags = formatTagsForEagle(folderTags);
	// const tagsToAdd = folderTags.filter((tag) => !pageTags.includes(tag));
	// const tagsToRemove = pageTags.filter((tag) => !folderTags.includes(tag));
	const formattedTags = formattedPageTags.concat(formattedFolderTags);
	console.log(formattedTags);
	const folder = await updateFolderTags(folderID, formattedTags).then(() => {return;});
	console.log(folder);
}
export default class EagleSync extends Plugin {
	settings: EagleSyncSettings;

	async activateView() {
		this.app.workspace.detachLeavesOfType(EAGLE_SYNC_VIEW);
		const rightLeaf: WorkspaceLeaf | null = this.app.workspace.getRightLeaf(false);
		if (!rightLeaf) {
			console.log('No right leaf found');
			return;
		}
		await rightLeaf.setViewState({
			type: EAGLE_SYNC_VIEW,
			active: true,
		});
		this.app.workspace.revealLeaf(rightLeaf);
		return;
	}

	async activateViewLeft() {
		this.app.workspace.detachLeavesOfType(EAGLE_SYNC_VIEW);
		const leaf: WorkspaceLeaf | null = this.app.workspace.getLeftLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: EAGLE_SYNC_VIEW,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
		return;
	}

	async clearGallery() {
		this.app.workspace.getLeavesOfType(EAGLE_SYNC_VIEW).forEach((leaf: WorkspaceLeaf) => {
			if (leaf.view instanceof ExampleView) {
				leaf.view.containerEl.empty();
			}
		});
		return;
	}

	async loadGallery() {
		const metadataKey = 'eagle_folder_id';
		const activePage = this.app.workspace.getActiveFile();
		if (activePage === null) return;
		this.app.vault.cachedRead(activePage)
			.then(async (content: string) => {
				if (!content) return;
				const value = await fetchValue(content, metadataKey, EAGLE_FOLDER_ID_REGEX);
				if (!value) return;

				if (!value) return await this.clearGallery();
				this.app.workspace.getLeavesOfType(EAGLE_SYNC_VIEW).forEach(async (leaf: WorkspaceLeaf) => {
					if (leaf.view instanceof ExampleView) {
						// const data = await fetchItemsListFromFolder([value]);
						const itemList: GetItemListResult | null = await fetchItemsListFromFolder([value]);
						if (!itemList) return;
						leaf.view.setGallery(itemList);
					}
				});
				return;
			}
			)
		return;
	}

	async reload() {
		const isEagleServerRunning = await checkEagleServerStatus();
		if (!isEagleServerRunning) {
			this.loadStatusBarEl(false);
			return;
		}
		if (!isEagleServerRunning) {
			return;
		}
	}

	async loadStatusBarEl(status: boolean) {
		const element = this.addStatusBarItem();
		if (status) {
			element.setText('Eagle Sync is running');
			element.addClass('is-running');
		} else {
			element.setText('Eagle Sync is not running');
			element.removeClass('is-running');
		}
	}

	async onload() {
		await this.loadSettings();
		this.registerView(
			EAGLE_SYNC_VIEW,
			(leaf) => new ExampleView(leaf)
		);

		// Add a ribbon icon to the left sidebar
		this.addRibbonIcon('sync', 'Sync Eagle Folder', () => {
			this.activateView();
		});


		this.activateView();
		this.registerEvent(this.app.workspace.on('active-leaf-change', async () => {
			await this.loadGallery();
			return;
		}));

	}

	onunload() {
		this.app.workspace.detachLeavesOfType(EAGLE_SYNC_VIEW);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
