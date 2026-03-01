const fetch = require('node-fetch');

async function test() {
  const apiKey = "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";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "qwen/qwen-2-vl-72b-instruct:free",
      messages: [
        { role: "user", content: "hello" }
      ]
    })
  });
  console.log(response.status);
  console.log(await response.text());
}
test();
