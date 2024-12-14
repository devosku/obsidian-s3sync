
import { App, Modal } from 'obsidian';

export default class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText(this.app.vault.getFiles().map((file) => file.path).join('\n'));
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
