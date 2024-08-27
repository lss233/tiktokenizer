import { hackModelsRemoveFirstToken } from "./index";
import { get_encoding, encoding_for_model, type Tiktoken } from "tiktoken";
import { oaiEncodings, oaiModels, openSourceModels } from ".";
import { PreTrainedTokenizer, env } from "@xenova/transformers";
import type { z } from "zod";
import {
  getHuggingfaceSegments,
  getTiktokenSegments,
  type Segment,
} from "~/utils/segments";
import { downloadFile } from "@huggingface/hub";

export interface TokenizerResult {
  name: string;
  // Array<{ text: string; tokens: { id: number; idx: number }[] }> ?
  tokens: number[];
  segments?: Segment[];
  count: number;
}

export interface Tokenizer {
  name: string;
  tokenize(text: string): TokenizerResult;
  free?(): void;
}

export class TiktokenTokenizer implements Tokenizer {
  private enc: Tiktoken;
  name: string;
  constructor(model: z.infer<typeof oaiModels> | z.infer<typeof oaiEncodings>) {
    const isModel = oaiModels.safeParse(model);
    const isEncoding = oaiEncodings.safeParse(model);
    console.log(isModel.success, isEncoding.success, model)
    if (isModel.success) {

      if (
        model === "text-embedding-3-small" ||
        model === "text-embedding-3-large"
      ) {
        throw new Error("Model may be too new");
      }

      const enc =
        model === "gpt-3.5-turbo" || model === "gpt-4" || model === "gpt-4-32k"
          ? get_encoding("cl100k_base", {
              "<|im_start|>": 100264,
              "<|im_end|>": 100265,
              "<|im_sep|>": 100266,
            })
          : model === "gpt-4o"
          ? get_encoding("o200k_base", {
              "<|im_start|>": 200264,
              "<|im_end|>": 200265,
              "<|im_sep|>": 200266,
            })
          : // @ts-expect-error r50k broken?
            encoding_for_model(model);
      this.name = enc.name ?? model;
      this.enc = enc;
    } else if (isEncoding.success) {
      this.enc = get_encoding(isEncoding.data);
      this.name = isEncoding.data;
    } else {
      throw new Error("Invalid model or encoding");
    }
  }

  tokenize(text: string): TokenizerResult {
    const tokens = [...(this.enc?.encode(text, "all") ?? [])];
    return {
      name: this.name,
      tokens,
      segments: getTiktokenSegments(this.enc, text),
      count: tokens.length,
    };
  }

  free(): void {
    this.enc.free();
  }
}

export class OpenSourceTokenizer implements Tokenizer {
  constructor(private tokenizer: PreTrainedTokenizer, name?: string) {
    this.name = name ?? tokenizer.name;
  }

  name: string;

  static async load(
    model: z.infer<typeof openSourceModels>
  ): Promise<PreTrainedTokenizer> {
    // use current host as proxy if we're running on the client
    // if (typeof window !== "undefined") {
    //   env.remoteHost = window.location.origin;
    // }
    // env.remotePathTemplate = "/hf/{model}";
    // // Set to false for testing!
    env.useBrowserCache = false;
    if(!openSourceModels.safeParse(model).success) {
      console.log('failed! hook from useCustomCache')
      env.useBrowserCache = false;
      env.useCustomCache = true
      let accessToken = '';
      const oauthResult = localStorage.getItem("oauth")
      if (oauthResult) {
        accessToken = JSON.parse(oauthResult)['accessToken'] ?? ''
      }
      const cache = new Map();
      env.customCache = {
        put(request: RequestInfo | URL, response: Response) {
          console.log('customCache, put', request);
          return Promise.resolve();
        },
        match(request: RequestInfo | URL, options?: CacheQueryOptions): Promise<Response | undefined> {
          if(cache.has(request)) {
            return Promise.resolve(cache.get(request))
          }

          let url;
          try {
            if (request instanceof Request) {
              url = new URL(request.url);
            } else if (typeof request === 'string' || request instanceof URL) {
              if (!request.toString().startsWith('http')) {
                return Promise.resolve(undefined);
              }
              url = new URL(request.toString());
            } else {
              throw new Error('Unsupported request type');
            }
      
            // Verify whether it is a Huggingface URL
            if (!url.hostname.endsWith('huggingface.co')) {
              console.error('Not a Huggingface URL');
              return Promise.resolve(undefined);
            }
      
            const path = url.pathname.split('/resolve/main/')[1];
            const modelId = url.pathname.split('/resolve/main/')[0].split('/').slice(1).join('/');
      
            if (!path || !modelId) {
              console.error('Invalid URL format');
              return Promise.resolve(undefined);
            }
      
            return downloadFile({
              repo: modelId,
              path: path,
              credentials: {
                accessToken
              }
            })
            .then(response => {
              if (response) {
                return response.text().then(body => {
                  // Save the response text in the cache
                  const resp = new Response(body, { status: 200 });
                  cache.set(request, resp);
                  return resp;
                });
              } else {
                console.log('customCache, match', request, options);
                return undefined;
              }
            })
            .catch(error => {
              console.error('Error during custom cache match:', error);
              return undefined;
            });
          } catch (error) {
            console.error('Error during custom cache match:', error);
            return Promise.resolve(undefined);
          }
        }
      };
    }
    const t = await PreTrainedTokenizer.from_pretrained(model, {
      progress_callback: (progress: any) =>
        console.log(`loading "${model}"`, progress),
    });
    console.log("loaded tokenizer", model, t.name);
    return t;
  }

  tokenize(text: string): TokenizerResult {
    // const tokens = this.tokenizer(text);
    const tokens = this.tokenizer.encode(text);
    const removeFirstToken = (
      hackModelsRemoveFirstToken.options as string[]
    ).includes(this.name);
    return {
      name: this.name,
      tokens,
      segments: getHuggingfaceSegments(this.tokenizer, text, removeFirstToken),
      count: tokens.length,
    };
  }
}

export async function createTokenizer(name: string): Promise<Tokenizer> {
  console.log("createTokenizer", name);
  const oaiEncoding = oaiEncodings.safeParse(name);
  if (oaiEncoding.success) {
    console.log("oaiEncoding", oaiEncoding.data);
    return new TiktokenTokenizer(oaiEncoding.data);
  }
  const oaiModel = oaiModels.safeParse(name);
  if (oaiModel.success) {
    console.log("oaiModel", oaiModel.data);
    return new TiktokenTokenizer(oaiModel.data);
  }

  console.log("loading tokenizer", name);
  const tokenizer = await OpenSourceTokenizer.load(name);
  console.log("loaded tokenizer", name);
  return new OpenSourceTokenizer(tokenizer, name);
}

// export async function createTokenizerFromJson(tokenizer: string, tokenizer_config: string): Promise<Tokenizer> {
//   console.log("createTokenizerFromJson")
//   await PreTrainedTokenizer.from_pretrained(model, {
//     progress_callback: (progress: any) =>
//       console.log(`loading "${model}"`, progress),
//   });
  
//   throw new Error("Invalid model or encoding");
// }