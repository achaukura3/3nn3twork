# 3nn3twork
A social media platform still in the works created using NodeJS HTML and CSS 

## ProdbyENNE Embed Deploy

Run one command from the repository root to build and publish the ProdbyENNE app into the embedded profile path:

npm run deploy:prodbyenne

For a quick smoke test, run deploy and open the embedded page in your default browser:

npm run deploy:prodbyenne:smoke

The command:
- builds D:\ENNE\ProdbyENNE
- copies the built files from dist into client/profiles/prodbyenne

The smoke command also opens:
- http://localhost:5000/profiles/prodbyenne/index.html
