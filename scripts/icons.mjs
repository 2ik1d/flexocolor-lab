import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public", { recursive: true });
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#10151a"/><rect x="74" y="74" width="364" height="364" rx="88" fill="#b8ec70"/><path d="M168 147h198v65H232v55h111v62H232v80h-64z" fill="#142015"/><circle cx="357" cy="386" r="24" fill="#142015"/></svg>',
);
for (const size of [192, 512])
  await sharp(svg).resize(size, size).png().toFile(`public/icon-${size}.png`);
