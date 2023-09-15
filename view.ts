import { ItemView } from "obsidian";
import { Menu, MenuItem } from "obsidian";
import { GetItemListResult } from "@petamorikei/eagle-js/dist/types";
import { EAGLE_CLIENT, EagleItemID } from "./main";

const fs = require('fs').promises;
const { app } = require('electron').remote;

let resizeTimeout: NodeJS.Timeout | null = null;

export const EAGLE_SYNC_VIEW = "example-view";
export type ItemInfoData = {
	id: string;
	name: string;
	size: number;
	ext: string;
	tags: string[];
	folders: string[];
	isDeleted: boolean;
	url: string;
	annotation: string;
	modificationTime: number;
	height: number;
	width: number;
	lastModified: number;
	palettes: {
		color: number[];
		ratio: number;
		$$hashKey: string;
	}[];
};

async function calculateAspectRatio(imgContainer: HTMLElement) {
	if (imgContainer.children.length < 2) return;
	const scaleFactor = 0.8;
	const img = imgContainer.children[0] as HTMLImageElement;
	const imgHeight = img.width * 128 / img.height * scaleFactor;
	imgContainer.style.width = `${imgHeight}px`;
	imgContainer.style.flexGrow = `${imgHeight}px`;
}

async function updateImageMetadata(data: ItemInfoData) {
	const imgMetadataContainer = document.getElementById('eagle-gallery-metadata-container');
	if (imgMetadataContainer) {
		imgMetadataContainer.innerHTML = '';
		const imgMetadata = document.createElement('div');
		imgMetadata.addClass('eagle-gallery-metadata');
		imgMetadata.innerHTML = `
			<div class="img-metadata">
				<div class="img-metadata-title">${data.name}</div>
				<div class="img-metadata-description">${data.annotation}</div>
			</div>
		`;
		imgMetadataContainer.appendChild(imgMetadata);
		const imgMetadataTags = document.createElement('div');
		imgMetadataTags.addClass('eagle-gallery-metadata-tags');
		imgMetadataTags.innerHTML = `
			<div class="img-metadata-tags">
				${data.tags.map((tag: string) => `<div class="img-metadata-tag">${tag}</div>`).join('')}
			</div>
		`;
		imgMetadataContainer.appendChild(imgMetadataTags);
	}
}

async function handleMouseEnter(event: MouseEvent, data: ItemInfoData) {
	const target = event.target as HTMLElement;
	if (target.className === 'img-container') {
		target.classList.add('hover');
	}
	if (target.className === 'img-container hover') {
		await updateImageMetadata(data);
	}
}

async function createItemThumbnail(id: string): Promise<string | null> {
	const path = await fetchItemThumbnail(id);
	if (!path) return null;
	const extension = path.split('.').pop();
	console.log('fileExt:', extension);
	let base64Image = '';
	try {
		const data = await fs.readFile(path);
		base64Image = `data:image/${extension};base64,${data.toString('base64')}`;
	} catch (error) {
		if (error.code !== 'ENOENT') {
			console.error('Error accessing file:', error);
			return null;
		}
		const icon = await app.getFileIcon(path.replace(/_thumbnail.png$/, '.png'));
		console.log('icon:', icon);
		if (!icon) return null;
		return icon.toDataURL();
	}
	return base64Image;
}

async function fetchItemThumbnail(itemID: EagleItemID): Promise<string | null> {
	const data = {
		id: itemID,
	};
	const response = await EAGLE_CLIENT.getItemThumbnail(data);
	if (!response) return null;
	if (response.status !== 'success') {
		console.error('Error fetching item thumbnail:', response);
		return null;
	}
	return response.data;
}

export class ExampleView extends ItemView {

	async createGalleryContainer() {
		const container = document.createElement('div');
		container.empty();
		container.addClass('eagle-gallery');
		container.addClass('eagle-gallery');
		this.containerEl.children[1].appendChild(container);
		return container;
	}

	async setGallery(result: GetItemListResult | null) {
		const startTime = Date.now();
		if (!result) {
			return;
		}
		const parentEl = this.containerEl.children[1];
		if (!parentEl) return;
		if (parentEl.children.length > 0) {
			parentEl.empty();
		}
		const galleryContainerEl = await this.createGalleryContainer();

		if (!result.data) return;
		const itemList = result.data;

		for (const item of itemList) {
			const base64Image = await createItemThumbnail(item.id);
			if (!base64Image) continue;
			const imgContainer = document.createElement('div');
			const gap = document.createElement('i');
			const img = document.createElement('img');

			img.onload = async function() {
				imgContainer.className = 'img-container';
				imgContainer.appendChild(img);
				imgContainer.appendChild(gap);
				galleryContainerEl.appendChild(imgContainer);
				await calculateAspectRatio(imgContainer);
				imgContainer.addEventListener('mouseenter', async function(event) {
					await handleMouseEnter(event, item);
				});
				imgContainer.addEventListener('mouseleave', function(event) {
					const target = event.target as HTMLElement;
					if (target.className === 'img-container hover') {
						target.classList.remove('hover');
					}
				});

				imgContainer.addEventListener('click', async function() {
					window.open(`eagle://item/${item.id}`, '_blank');
				});

				imgContainer.addEventListener('contextmenu', async function() {
					const menu = new Menu();
					menu.addItem((menuItem: MenuItem) => {
						menuItem.setTitle('Open in Eagle');
						menuItem.setIcon('open-in-app');
						menuItem.onClick(async () => {
							window.open(`eagle://item/${item.id}`, '_blank');
						});
					}
					);

				});


				const darkCheckmateColor = '%23a0a0a0';
				const lightCheckmateColor = '%23ffffff';
				const opacityCheckmate = '0.15';
				const sizeCheckmateCell = 25;

				const generateCheckmateBackground = (darkColor: string, lightColor: string) => {
					return `data:image/svg+xml;utf8,<svg preserveAspectRatio="none" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="5" height="5" fill="${darkColor}" opacity="${opacityCheckmate}" /><rect x="5" y="5" width="5" height="5" fill="${darkColor}" opacity="${opacityCheckmate}" /><rect x="5" y="0" width="5" height="5" fill="${lightColor}" opacity="${opacityCheckmate}" /><rect x="0" y="5" width="5" height="5" fill="${lightColor}" opacity="${opacityCheckmate}" /></svg>`;
				};

				const darkColor = darkCheckmateColor || 'grey';
				const lightColor = lightCheckmateColor || 'white';
				const checkmateBackground = generateCheckmateBackground(darkColor, lightColor);

				imgContainer.style.background = `url('${checkmateBackground}') 0 0/${sizeCheckmateCell}px ${sizeCheckmateCell}px round`;

				const fileNameEl = document.createElement('div');
				fileNameEl.className = 'file-name';
				fileNameEl.innerText = item.name;
				imgContainer.appendChild(fileNameEl);
			}

			img.src = base64Image;

			const endTime = Date.now();
			console.log('Time taken to load gallery:', endTime - startTime)

		}
	}

	getViewType() {
		return EAGLE_SYNC_VIEW;
	}

	getDisplayText() {
		return "Eagle Gallery";
	}

	async empty() {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
	}

	async onOpen() {
	}

	async onClose() {
		await this.empty();
	}

	resizeTimeout = 100;
	async onResize() {
		clearTimeout(this.resizeTimeout);
		resizeTimeout = setTimeout(async () => {
			//
			if (!this.containerEl.children[1]) return;
			if (!this.containerEl.children[1].children.length) return;
			const imgContainers = this.containerEl.children[1].children;
			for (let i = 0; i < imgContainers.length; i++) {
				await calculateAspectRatio(imgContainers[i] as HTMLElement);
			}
		}, 10);
	}

}
