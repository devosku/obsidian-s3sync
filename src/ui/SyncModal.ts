import { App, Modal } from "obsidian";
import { SyncProgressState } from "src/types";

export default class SyncModal extends Modal {
	private syncProgressState: SyncProgressState;

	constructor(app: App, syncProgressState: SyncProgressState) {
		super(app);
		this.syncProgressState = syncProgressState;
	}

	public setSyncProgressState(state: SyncProgressState) {
		this.syncProgressState = state;
		const msg = this.contentEl.querySelector("p");
		const progressBar = this.contentEl.querySelector("progress");
		if (!msg || !progressBar) {
			return;
		}
		msg.innerText = state.msg;
		progressBar.setAttribute("value", state.current.toString());
		progressBar.setAttribute("max", state.total.toString());
	}

	onOpen() {
		const { contentEl } = this;
		const msg = contentEl.createEl("p", { text: this.syncProgressState.msg });
		msg.style.marginTop = "0";

		const progressBar = contentEl.createEl("progress", {
			attr: {
				id: "s3sync-progress",
				value: this.syncProgressState.current.toString(),
				max: this.syncProgressState.total.toString(),
			},
		});
		progressBar.style.width = "100%";
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
