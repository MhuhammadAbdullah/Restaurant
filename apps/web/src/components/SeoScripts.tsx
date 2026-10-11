import Script from "next/script";
import type { SiteInfo } from "../lib/seo";
import { siteUrlOf } from "../lib/seo";

/** Marketing tags (GA4, GTM, Meta Pixel, TikTok Pixel, Google Ads) and the business structured data. All ids come from Admin > SEO & Marketing and are format-validated by the API. */
export function SeoScripts({ site }: { site: SiteInfo }) {
  const t = site.seo.tracking ?? {};
  const gtagId = t.ga4Id || t.googleAdsId;
  const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

  const b = site.seo.business ?? {};
  const url = siteUrlOf(site.seo);
  const address =
    b.streetAddress || b.city
      ? { "@type": "PostalAddress", streetAddress: b.streetAddress, addressLocality: b.city, addressRegion: b.region, postalCode: b.postalCode, addressCountry: b.country || "PK" }
      : undefined;
  const sameAs = Object.values(site.socialLinks ?? {}).filter((v) => typeof v === "string" && /^https?:\/\//.test(v));
  const business = {
    "@context": "https://schema.org",
    "@type": b.type || "Restaurant",
    "@id": `${url}/#business`,
    name: site.name,
    url,
    image: site.seo.defaultImage || site.logoUrl || undefined,
    logo: site.logoUrl || undefined,
    telephone: site.contactPhone || undefined,
    email: site.contactEmail || undefined,
    priceRange: b.priceRange || undefined,
    servesCuisine: b.cuisine ? b.cuisine.split(",").map((c) => c.trim()).filter(Boolean) : undefined,
    address,
    sameAs: sameAs.length ? sameAs : undefined,
    hasMenu: `${url}/`,
  };
  const website = { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(business) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(website) }} />

      {t.gtmId && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${json(t.gtmId)});`}
        </Script>
      )}

      {gtagId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());${t.ga4Id ? `gtag('config',${json(t.ga4Id)});` : ""}${t.googleAdsId ? `gtag('config',${json(t.googleAdsId)});` : ""}`}
          </Script>
        </>
      )}

      {t.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${json(t.metaPixelId)});fbq('track','PageView');`}
        </Script>
      )}

      {t.tiktokPixelId && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${json(t.tiktokPixelId)});ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
    </>
  );
}
