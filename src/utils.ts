import { createHash } from "crypto";
import { createReadStream } from "fs";

export function md5(filePath: string): Promise<string> {
	return new Promise((resolve) => {
		const hash = createHash("md5");
		const stream = createReadStream(filePath);
		stream.on("data", (data) => {
			hash.update(data);
		});
		stream.on("end", () => {
			resolve(hash.digest("hex"));
		});
	});
}