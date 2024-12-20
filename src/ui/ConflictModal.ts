import { App, Modal } from "obsidian";
import Synchronizer from "src/Synchronizer";

export default class ConflictModal extends Modal {
	private synchronizer: Synchronizer;
	private conflict: string;

	constructor(app: App, synchronizer: Synchronizer,  conflict: string) {
		super(app);
		this.synchronizer = synchronizer;
		this.conflict = conflict;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Resolve conflict" });
		contentEl.createEl("p", {
			text:
				"Local and remote files are in conflict. " +
				"This happens when the same file has been " +
				"modified locally and on the cloud storage.",
		});

		contentEl.createEl("h3", { text: "Resolution" });

		contentEl.createEl("p", {
			text:
				"Please resolve the conflict manually by " +
				"choosing which version to keep.",
		});

		const fileEl = contentEl.createEl("p", { text: `File: ${this.conflict}` });
		fileEl.style.fontWeight = "bold";

		const localBtnEl = contentEl.createEl("button", {
			text: "Local",
		});
		localBtnEl.addEventListener("click", async () => {
			await this.synchronizer.manuallySolveFileConflict(this.conflict, "local");
			this.close();
		});

		const remoteBtnEl = contentEl.createEl("button", {
			text: "Remote",
		});
		remoteBtnEl.addEventListener("click", async () => {
			await this.synchronizer.manuallySolveFileConflict(this.conflict, "remote");
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
