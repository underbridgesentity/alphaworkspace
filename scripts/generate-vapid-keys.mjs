/** Prints a fresh VAPID key pair for web push. Paste into .env.local. */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
