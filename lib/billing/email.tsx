import "server-only";
import { Html, Head, Preview, Body, Container, Heading, Text, Button, Link } from "@react-email/components";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { getEnv } from "@/lib/env";

export function cleanEmailCopy(value: string) {
  return value.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u00b7\u2022\u2192]/g, "-").replace(/\u2026/g, "...").replace(/[\u2713\u2717]/g, "");
}
export function SignInEmail({ url }: { url: string }) {
  return <Html><Head /><Preview>Your secure link to Fusion Gen Matrix</Preview>
    <Body style={{ backgroundColor: "#10120e", fontFamily: "Arial, sans-serif", padding: "40px 16px", color: "#f5f7ee" }}>
      <Container style={{ maxWidth: 520, backgroundColor: "#191c16", padding: 32, borderRadius: 20 }}>
        <Text style={{ color: "#c7f36b", fontWeight: 700, letterSpacing: "2px", fontSize: 12 }}>FUSION GEN MATRIX</Text>
        <Heading style={{ fontSize: 28 }}>Your next idea starts here.</Heading>
        <Text>Use this secure link to sign in. It expires in 10 minutes and works once.</Text>
        <Button href={url} style={{ backgroundColor: "#c7f36b", color: "#152006", padding: "16px 24px", borderRadius: 12, fontWeight: 700 }}>Sign in to Fusion Gen Matrix</Button>
        <Text style={{ color: "#c1c5b7", fontSize: 13 }}>If the button does not open, copy this link into your browser:</Text>
        <Link href={url} style={{ color: "#c7f36b", fontSize: 12, wordBreak: "break-all" }}>{url}</Link>
        <Text style={{ color: "#c1c5b7", fontSize: 13 }}>If you did not request this email, you can ignore it.</Text>
      </Container>
    </Body>
  </Html>;
}
export function CreditReceipt({ credits, accountUrl }: { credits: number; accountUrl: string }) {
  return <Html><Head /><Preview>Your Fusion credits are ready</Preview>
    <Body style={{ backgroundColor: "#10120e", fontFamily: "Arial, sans-serif", padding: "40px 16px", color: "#f5f7ee" }}>
      <Container style={{ maxWidth: 520, backgroundColor: "#191c16", padding: 32, borderRadius: 20 }}>
        <Text style={{ color: "#c7f36b", fontWeight: 700 }}>FUSION GEN MATRIX</Text>
        <Heading>Credits added</Heading>
        <Text>{credits.toLocaleString("en-US")} credits have been added to your top-up balance. They do not expire.</Text>
        <Button href={accountUrl} style={{ backgroundColor: "#c7f36b", color: "#152006", padding: "16px 24px", borderRadius: 12 }}>View your balance</Button>
        <Text style={{ color: "#c1c5b7", fontSize: 13 }}>Your payment receipt comes separately from Stripe.</Text>
      </Container>
    </Body>
  </Html>;
}
export async function sendMagicLink(to: string, url: string) {
  const env = getEnv();
  if (env.APP_MODE !== "live" || !process.env.AUTH_RESEND_KEY || !process.env.EMAIL_FROM) throw new Error("Email sign-in is not configured.");
  if (new URL(url).origin !== new URL(env.APP_URL).origin) throw new Error("Invalid sign-in link origin.");
  const component = <SignInEmail url={url} />;
  const result = await new Resend(process.env.AUTH_RESEND_KEY).emails.send({
    from: process.env.EMAIL_FROM, to, subject: cleanEmailCopy("Sign in to Fusion Gen Matrix"),
    html: await render(component), text: await render(component, { plainText: true })
  });
  if (result.error) throw new Error("The sign-in email could not be sent.");
}
export async function sendCreditReceipt(to: string, credits: number, reference: string) {
  const env = getEnv();
  if (env.APP_MODE !== "live" || !process.env.AUTH_RESEND_KEY || !process.env.EMAIL_FROM) throw new Error("Receipts are not configured.");
  const component = <CreditReceipt credits={credits} accountUrl={new URL("/account/billing", env.APP_URL).href} />;
  const result = await new Resend(process.env.AUTH_RESEND_KEY).emails.send({
    from: process.env.EMAIL_FROM, to, subject: cleanEmailCopy("Credits added"),
    html: await render(component), text: await render(component, { plainText: true })
  }, { idempotencyKey: "fusion-credit-receipt-" + reference });
  if (result.error) throw new Error("The credit receipt could not be sent.");
}
