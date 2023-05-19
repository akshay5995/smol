import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import { ChatOpenAI } from "langchain/chat_models";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from "langchain/prompts";
import { LLMChain } from "langchain";

const generatedDir = "generated";
const openai_model = "gpt-4";
const openai_model_max_tokens = 2000;

let writeFile = util.promisify(fs.writeFile);
let readFile = util.promisify(fs.readFile);
let unlink = util.promisify(fs.unlink);
let readdir = util.promisify(fs.readdir);

const chat = new ChatOpenAI({
  temperature: 0.5,
  topP: 1,
  modelName: openai_model,
  maxTokens: openai_model_max_tokens,
});

async function generateResponse(
  systemPrompt: string,
  userPrompt: string,
  args: any[] = []
): Promise<string | undefined> {
  try {
    const chatPrompt = ChatPromptTemplate.fromPromptMessages([
      SystemMessagePromptTemplate.fromTemplate(
        systemPrompt.replaceAll("{", "").replaceAll("}", "")
      ),
      HumanMessagePromptTemplate.fromTemplate(
        userPrompt.replaceAll("{", "").replaceAll("}", "")
      ),
    ]);

    const chain = new LLMChain({
      prompt: chatPrompt,
      llm: chat,
    });

    const chainReponse = await chain.call({});

    return chainReponse.text as string;
  } catch (error) {
    console.log(error);
  }
}

async function generateFile(
  filename: string,
  filepathsString?: string,
  sharedDependencies?: string | null,
  prompt?: string
) {
  let filecode = await generateResponse(
    `You are an AI developer who is trying to write a program that will generate code for the user based on their intent.

        the app is: ${prompt}

        the files we have decided to generate are: ${filepathsString}

        the shared dependencies (like filenames and variable names) we have decided on are: ${sharedDependencies}

        only write valid code for the given filepath and file type, and return only the code.
        do not add any other explanation, only return valid code for that file type.
        `,
    `We have broken up the program into per-file generation.
        Now your job is to generate only the code for the file ${filename}.
        Make sure to have consistent filenames if you reference other files we are also generating.

        Remember that you must obey 3 things:
           - you are generating code for the file ${filename}
           - do not stray from the names of the files and the shared dependencies we have decided on
           - MOST IMPORTANT OF ALL - the purpose of our app is ${prompt} - every line of code you generate must be valid code. Do not include code fences in your response, for example

        Bad response:
        \`\`\`javascript
        console.log("hello world")
        \`\`\`

        Good response:
        console.log("hello world")

        Begin generating the code now.
        `
  );

  return { filename, filecode };
}

async function writeToFile(
  filename: string,
  filecode: string | null | undefined,
  directory: string
) {
  console.log(`\x1b[94m${filename}\x1b[0m`);
  console.log(filecode);

  let filePath = path.join(directory, filename);
  let dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  await writeFile(filePath, filecode || "");
}

async function cleanDir(directory: string) {
  let extensionsToSkip = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".svg",
    ".ico",
    ".tif",
    ".tiff",
  ];

  if (fs.existsSync(directory)) {
    let files = await readdir(directory);
    for (let file of files) {
      let extension = path.extname(file);
      if (!extensionsToSkip.includes(extension)) {
        await unlink(path.join(directory, file));
      }
    }
  } else {
    fs.mkdirSync(directory, { recursive: true });
  }
}

async function main(
  prompt: string,
  directory: string = generatedDir,
  file?: string
) {
  if (prompt.endsWith(".md")) {
    prompt = await readFile(prompt).toString();
  }

  console.log("hi its me, 🐣the smol developer🐣! you said you wanted:");
  console.log(`\x1b[92m${prompt}\x1b[0m`);

  let detailedPrompt = await generateResponse(
    `You are an software architect who is trying to design a program that will generate code for the user based on their intent.`,
    `Please elaborate on the "${prompt}" by detailing the specific requirements, technical considerations, user interface, performance, privacy, error handling, and testing strategy so that the developer can write the code to meet your requirements and expectations. Make the requirements as detailed as possible and also provide the list of packages and libraries that you would use to implement the program.`
  );

  console.log(detailedPrompt);

  let filepathsString = await generateResponse(
    `You are an AI developer who is trying to write a program that will generate code for the user based on their intent.

        When given their intent, create a complete, exhaustive list of filepaths that the user would write to make the program.

        only list the filepaths you would write, and return them as a javascript list of strings.
        do not add any other explanation, only return a javascript list of strings.
        `,
    detailedPrompt || prompt
  );

  console.log(filepathsString);

  if (!filepathsString) {
    console.log("no filepaths generated, exiting");
    return;
  }

  let filepathsList: string[] = JSON.parse(
    filepathsString.replaceAll("'", '"')
  );

  let sharedDependencies: string | null | undefined = null;
  if (fs.existsSync("shared_dependencies.md")) {
    sharedDependencies = await readFile("shared_dependencies.md").toString();
  }

  if (file) {
    console.log(`file ${file}`);
    let { filename, filecode } = await generateFile(
      file,
      filepathsString,
      sharedDependencies,
      prompt
    );
    await writeToFile(filename, filecode, directory);
  } else {
    await cleanDir(directory);

    sharedDependencies = await generateResponse(
      `You are an AI developer who is trying to write a program that will generate code for the user based on their intent.

        In response to the user's prompt:

        ---
        the app is: ${prompt}
        ---

        the files we have decided to generate are: ${filepathsString}

        Now that we have a list of files, we need to understand what dependencies they share.
        Please name and briefly describe what is shared between the files we are generating
                    including exported variables, data schemas, id names of every DOM elements that JavaScript functions will use, message names, and function names.
        Exclusively focus on the names of the shared dependencies, and do not add any other explanation.`,
      prompt
    );

    console.log(sharedDependencies);
    await writeToFile("shared_dependencies.md", sharedDependencies, directory);

    for (let name of filepathsList) {
      let { filename, filecode } = await generateFile(
        name,
        filepathsString,
        sharedDependencies,
        prompt
      );
      await writeToFile(filename, filecode, directory);
    }
  }

  process.exit(0);
}

let args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Please provide a prompt");
  process.exit(1);
}

let prompt = args[0];
let directory = args[1] || generatedDir;
let file = args[2];

main(prompt, directory, file).catch(console.error);
