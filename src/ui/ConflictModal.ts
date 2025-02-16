import { App, Modal } from "obsidian";
import Synchronizer from "src/Synchronizer";
import { FileSyncInfo } from "src/types";

export default class ConflictModal extends Modal {
	private synchronizer: Synchronizer;
	private conflict: FileSyncInfo;
	private cb: () => void;

	constructor(
		app: App,
		synchronizer: Synchronizer,
		conflict: FileSyncInfo,
		callback: () => void
	) {
		super(app);
		this.synchronizer = synchronizer;
		this.conflict = conflict;
		this.cb = callback;
	}

	async onButtonClick(btn: "local" | "remote" | "ignore") {
		if (!this.conflict.localFile || !this.conflict.remoteFile) {
			throw new Error("Conflict does not have local and remote files");
		}
		if (btn === "local") {
			await this.synchronizer.manuallySolveFileConflict(
				this.conflict.localFile?.path,
				"local"
			);
		} else if (btn === "remote") {
			await this.synchronizer.manuallySolveFileConflict(
				this.conflict.remoteFile?.path,
				"remote"
			);
		} else if (btn === "ignore") {
			await this.synchronizer.fileSyncRepository.markSynchronizationComplete(
				this.conflict.localFile?.path
			);
		}
		this.close();
		await this.cb();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h1", { text: "Resolve conflict" });
		contentEl.createEl("p", {
			text:
				"Local and remote files are in conflict. " +
				"This happens when the same file has been " +
				"modified locally and on the cloud storage.",
		});

		const fileLink = contentEl.createEl("a", {
			text: this.conflict.localFile?.path,
		});
		fileLink.style.wordBreak = 'break-all';
		if (this.conflict.localFile) {
			fileLink.setAttr(
				"href",
				`obsidian://open?vault=${this.app.vault.getName()}&file=${encodeURIComponent(
					this.conflict.localFile.path
				)}`
			);
		}

		contentEl.createEl("p", {
			text:
				"Please resolve the conflict manually by " +
				"choosing which version to keep.",
		});

		const flexEl = contentEl.createEl("div");
		flexEl.style.display = "flex";
		flexEl.style.justifyContent = "space-between";
		flexEl.style.marginBottom = "8px";

		const leftEl = flexEl.createEl("div");
		leftEl.style.marginRight = "8px";
		const rightEl = flexEl.createEl("div");

		const leftTitleEl = leftEl.createEl("h3", { text: "Local file" });
		const rightTitleEl = rightEl.createEl("h3", { text: "Remote file" });
		leftTitleEl.style.marginTop = "0";
		rightTitleEl.style.marginTop = "0";

		const leftList = leftEl.createEl("ul");
		if (this.conflict.localFile) {
			leftList.style.listStyleType = "none";
			leftList.style.padding = "0";
			leftList.style.margin = "0";

			leftList.createEl("li", {
				text: `Size: ${this.conflict.localFile?.size} bytes`,
			});
			const localMtime = new Date(
				this.conflict.localFile?.mtime
			).toUTCString();
			leftList.createEl("li", {
				text: `Last modified: ${localMtime}`,
			});
			const localBtnEl = leftEl.createEl("button", {
				text: "Keep Local",
			});
			localBtnEl.style.marginTop = "16px";
			localBtnEl.addEventListener("click", async () => {
				await this.onButtonClick("local");
			});
		}

		const rightList = rightEl.createEl("ul");
		if (this.conflict.remoteFile) {
			rightList.style.listStyleType = "none";
			rightList.style.padding = "0";
			rightList.style.margin = "0";

			rightList.createEl("li", {
				text: `Size: ${this.conflict.remoteFile?.size} bytes`,
			});
			const remoteMtime = new Date(
				this.conflict.remoteFile?.mtime
			).toUTCString();
			rightList.createEl("li", {
				text: `Last modified: ${remoteMtime}`,
			});

			const remoteBtnEl = rightEl.createEl("button", {
				text: "Keep Remote",
			});
			remoteBtnEl.style.marginTop = "16px";
			remoteBtnEl.addEventListener("click", async () => {
				await this.onButtonClick("remote");
			});
		}

		const ignoreBtnEl = contentEl.createEl("button", {
			text: "Skip",
		});
		ignoreBtnEl.style.marginTop = "16px";
		ignoreBtnEl.addEventListener("click", async () => {
			await this.onButtonClick("ignore");
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
