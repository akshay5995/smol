import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import { generateResponse } from "./langchain.js";
import { extensionsToSkip } from "./constants.js";

let readFile = util.promisify(fs.readFile);

const generatedDir = process.env.GENERATED_DIR || "generated";

async function readFileAsync(filename: string): Promise<string> {
  return readFile(filename).then((buffer) => buffer.toString());
}

async function walkDirectory(
  directory: string
): Promise<{ [relative_filepath: string]: string }> {
  const codeContents: { [relative_filepath: string]: string } = {};

  const files = fs.readdirSync(directory);
  for (const file of files) {
    if (!extensionsToSkip.some((ext) => file.endsWith(ext))) {
      const relative_filepath = path.relative(
        directory,
        path.join(directory, file)
      );
      try {
        codeContents[relative_filepath] = await readFileAsync(
          path.join(directory, file)
        );
      } catch (e) {
        codeContents[
          relative_filepath
        ] = `Error reading file ${file}: ${e.toString()}`;
      }
    }
  }

  return codeContents;
}

async function main(prompt: string, model = "gpt-3.5-turbo"): Promise<void> {
  const codeContents = await walkDirectory(generatedDir);

  const context = Object.entries(codeContents)
    .map(([path, contents]) => `${path}:\n${contents}`)
    .join("\n");
  const system =
    "You are an AI debugger who is trying to debug a program for a user based on their file system. The user has provided you with the following files and their contents, finally followed by the error message or issue they are facing.";
  const fullPrompt =
    "My files are as follows: " +
    context +
    "\n\nMy issue is as follows: " +
    prompt +
    "\n\nGive me ideas for what could be wrong and what fixes to do in which files.";
  const res = await generateResponse(system, fullPrompt);
  console.log("\033[96m" + res + "\033[0m");
}

let args = process.argv.slice(2);

if (args.length < 1) {
  console.error("Please provide a prompt");
  process.exit(1);
}

let prompt = args[0];

main(prompt).catch((e) => {
  console.error(e);
  process.exit(1);
});
