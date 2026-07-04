import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

async function main() {
  try {
      const completion = await openai.chat.completions.create({
        model: "z-ai/glm-5.2",
        messages: [{"role":"user","content":"hello"}],
        temperature: 1,
        top_p: 1,
        max_tokens: 16384,
        seed: 42,
        stream: true
      })
      
      let out = "";
      for await (const chunk of completion) {
            out += chunk.choices[0]?.delta?.content || '';
      }
      console.log("SUCCESS:", out);
  } catch (e) {
      console.error("ERROR:", e);
  }
}

main();
