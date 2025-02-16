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
		const label = this.contentEl.querySelector("label");
		const progressBar = this.contentEl.querySelector("progress");
		if (!msg || !label || !progressBar) {
			return;
		}
		msg.innerText = state.msg;
		label.innerText = `${state.current}/${state.total}:`;
		progressBar.setAttribute("value", state.current.toString());
		progressBar.setAttribute("max", state.total.toString());
	}

	onOpen() {
		const { contentEl } = this;
		const msg = contentEl.createEl("p", { text: this.syncProgressState.msg });
		msg.style.marginTop = "0";

		const label = contentEl.createEl("label", {
			attr: { for: "s3sync-progress" },
			text: `${this.syncProgressState.current}/${this.syncProgressState.total}:`,
		});
		label.style.display = "block";

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
