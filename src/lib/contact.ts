/** Tiffany's public contact details, shown on the site and in emails. */
export const CONTACT = {
  phoneDisplay: "0991 924 3583",
  phoneHref: "tel:+639919243583",
  email: "tiffanyspickleballcourt@gmail.com",
  facebookUrl: "https://www.facebook.com/profile.php?id=61589806590961",
} as const;

/** Plain-text contact block appended to customer emails. */
export const CONTACT_EMAIL_TEXT = `\n\nContact Tiffany's Pickleball Court\nMobile: ${CONTACT.phoneDisplay}\nEmail: ${CONTACT.email}\nFacebook: ${CONTACT.facebookUrl}`;

/** HTML contact block appended to customer emails. Values are constants. */
export const CONTACT_EMAIL_HTML = `<p style="margin-top:24px;border-top:1px solid #e2ddd0;padding-top:16px;font-size:14px;color:#5b6b62"><strong style="color:#16231c">Contact Tiffany&apos;s Pickleball Court</strong><br>Mobile: <a href="${CONTACT.phoneHref}" style="color:#0f5132">${CONTACT.phoneDisplay}</a><br>Email: <a href="mailto:${CONTACT.email}" style="color:#0f5132">${CONTACT.email}</a><br>Facebook: <a href="${CONTACT.facebookUrl}" style="color:#0f5132">Tiffany&apos;s Pickleball Court</a></p>`;
