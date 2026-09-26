// Merge these settings into stickonfig.config.mjs. This endpoint is a placeholder.
export default {submission:{mode:'webhook',endpoint:'https://api.example.com/sticker-jobs',buttonLabel:'Send files to my print shop'}};
// Receives multipart: manifest JSON + eight artifact file fields.
// Expect {ok:true,id:"..."}. Do not expose a signing secret in browser config.
// To call a private/signed webhook, use your own authenticated server proxy.
