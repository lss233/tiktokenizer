import { useDropzone } from "react-dropzone";
import { cache, useState } from "react";
import { Button } from "~/components/Button";

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { oauthLoginUrl, oauthHandleRedirectIfPresent, downloadFile } from "@huggingface/hub";

export function CustomModelPopup(props:
  { children?: React.ReactNode, open: boolean, onSelect: ((modelId: string) => void), onOpenChange: ((change: boolean) => void) }
) {
  const [modelId, setModelId] = useState("meta-llama/Meta-Llama-3-8B");
  const [tokenizerFile, setTokenizerFile] = useState(null);
  const [configFile, setConfigFile] = useState(null);
  const [isLoading, setLoading] = useState(false);
  let accessToken = '';
  const oauthResult = localStorage.getItem("oauth")
  if (oauthResult) {
    accessToken = JSON.parse(oauthResult)['accessToken'] ?? ''
  }
  const [hfToken, setHfToken] = useState(accessToken);

  async function hfLogin() {
    const url = await oauthLoginUrl({
      clientId: process.env.NEXT_PUBLIC_HF_APP_CLIENT_ID,
      scopes: 'read-repos'
    })
    window.location.href = url + '&prompt=consent'
  }

  async function downloadTokenizer() {
    if (isLoading) {
      return
    }
    setLoading(true);
    const tokenizerJsonResp = await downloadFile({
      repo: modelId,
      path: 'tokenizer.json',
      credentials: {
        accessToken
      }
    })
    console.log(await tokenizerJsonResp?.text())
    const tokenizerConfigJsonResp = await downloadFile({
      repo: modelId,
      path: 'tokenizer_config.json',
      credentials: {
        accessToken
      }
    })
    console.log(await tokenizerConfigJsonResp?.text())
    props.onSelect(modelId)
    setLoading(false);
  }
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Trigger asChild>
        {props.children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="DialogOverlay" />
        <Dialog.Content className="DialogContent">
          <Dialog.Title className="DialogTitle">Custom Tokenizer</Dialog.Title>
          <Dialog.Description className="DialogDescription">
            Provide a model id from HuggingFace.
          </Dialog.Description>
          <fieldset className="Fieldset">
            <label className="Label" htmlFor="name">
              Model Id
            </label>
            <input className="Input" id="name" placeholder="meta-llama/Meta-Llama-3-8B"
              value={modelId}
              onChange={e => setModelId(e.target.value)} />
          </fieldset>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* Sign in with huggingface button */}
            {hfToken == "" && (
              <img src="https://huggingface.co/datasets/huggingface/badges/resolve/main/sign-in-with-huggingface-lg.svg"
                alt="Sign in with Hugging Face"
                style={{ cursor: 'pointer' }}
                id="signin"
                onClick={hfLogin} />
            )}
            {/* download button */}
            {hfToken != "" && (
              <button className={`Button ${isLoading ? 'gray' : 'green'}`}
                disabled={isLoading}
                onClick={downloadTokenizer}
              >
                <span className="flex items-center gap-2">
                  <span>Download</span>
                  {isLoading && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-b-transparent" />
                  )}
                </span>
              </button>
            )}
          </div>

          <Dialog.Description className="DialogDescription">
            Or upload a `tokenizer.json` and `tokenizer_config.json` from local disk.
          </Dialog.Description>

          <div style={{ display: 'flex', marginTop: 25, justifyContent: 'flex-end' }}>
            <Dialog.Close asChild>
              <button className="Button green">Done</button>
            </Dialog.Close>
          </div>
          <Dialog.Close asChild>
            <button className="IconButton" aria-label="Close">
              x
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}