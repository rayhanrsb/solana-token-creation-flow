import { initializeKeypair } from "./initializeKeypair";
import * as web3 from "@solana/web3.js";
import * as token from "@solana/spl-token";
import { Metaplex, keypairIdentity, bundlrStorage, toMetaplexFile } from '@metaplex-foundation/js';
import { DataV2, createCreateMetadataAccountV2Instruction } from "@metaplex-foundation/mpl-token-metadata";
import * as fs from "fs";

async function createToken (
  connection: web3.Connection,
  payer: web3.Keypair,
  firstTokenOwner: web3.PublicKey,
  metaplex: Metaplex,
  name: string,
  symbol: string,
  description: string,
  mintAuthority: web3.PublicKey,
  freezeAuthority: web3.PublicKey,
  decimals: number,
  amount: number
) {
  // Step 1 - Create a new mint token
  const tokenMint = await token.createMint(connection, payer, mintAuthority, freezeAuthority, decimals);
  console.log(`The token mint account address is ${tokenMint}`);
  console.log(`Token Mint: https://explorer.solana.com/address/${tokenMint}?cluster=devnet`);

  // Step 2 - Create a metadata account for the token mint
  // For the image, normally you would need to get a way for the user to upload the image. In this case, I just used a file in the assets directory
  const buffer = fs.readFileSync("assets/r.png");
  const file = toMetaplexFile(buffer, "icon.png");
  const imageUri = await metaplex.storage().upload(file);
  console.log("Metaplex uri:", imageUri);

  // Upload metadata and get the metadata uri (off chain metadata)
  const { uri } = await metaplex.nfts().uploadMetadata({
    name: name,
    description: description,
    image: imageUri
  });
  console.log("Metadata uri:", uri);

  // Get metadata account address
  const metadataPDA = metaplex.nfts().pdas().metadata({mint: tokenMint});

  // Onchain metadata format
  const tokenMetadata = {
    name: name,
    symbol: symbol,
    uri: uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null
  } as DataV2;

  const transaction = new web3.Transaction().add(
    createCreateMetadataAccountV2Instruction(
      {
        metadata: metadataPDA,
        mint: tokenMint,
        mintAuthority: mintAuthority,
        payer: payer.publicKey,
        updateAuthority: mintAuthority
      },
      {
        createMetadataAccountArgsV2: {
          data: tokenMetadata,
          isMutable: true
        }
      }
    )
  );

  const metadataTransactionSignature = await web3.sendAndConfirmTransaction(connection, transaction, [payer]);

  console.log(`Create Metadata Account: https://explorer.solana.com/tx/${metadataTransactionSignature}?cluster=devnet`);

  // Step 3 - Create or get a token account
  const tokenAccount = await token.getOrCreateAssociatedTokenAccount(connection, payer, tokenMint, firstTokenOwner);
  console.log(`Token Account: https://explorer.solana.com/address/${tokenAccount.address}?cluster=devnet`);

  // Step 4 - Mint tokens
  const mintInfo = await token.getMint(connection, tokenMint);

  const mintTransactionSignature = await token.mintTo(connection, payer, tokenMint, tokenAccount.address, mintAuthority, amount * 10 ** mintInfo.decimals);
  console.log(`Mint Token Transaction: https://explorer.solana.com/tx/${mintTransactionSignature}?cluster=devnet`);

}

async function main() {
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
  const user = await initializeKeypair(connection);

  console.log("PublicKey:", user.publicKey.toBase58());

  // metaplex setup
  const metaplex = Metaplex.make(connection).use(keypairIdentity(user)).use(bundlrStorage({
    address: "https://devnet.bundlr.network",
    providerUrl: "https://api.devnet.solana.com",
    timeout: 60000
  }));

  // Call the function to create the token with its associated metadata and transfer to the initial owner
  await createToken(
    connection,
    user,
    user.publicKey,
    metaplex,
    "RSB",
    "RSB",
    "A token created by Rayhan Beebeejaun",
    user.publicKey,
    user.publicKey,
    2,
    100
  )
}

main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
