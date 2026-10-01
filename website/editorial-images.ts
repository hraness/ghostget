export type EditorialImage = Readonly<{
  alt: string;
  canonicalPath: `/blog/${string}/` | "/compare/" | "/compare/personal-agents-browser-use/" | "/agentic-web-spoofing/" | "/vms-cannot-contain-agents/" | "/webmcp/";
  caption: string;
  cardDescription: string;
  cardTitle: string;
  credit: string;
  creditUrl: string;
  derivatives: readonly Readonly<{ height: number; sha256: string; src: `/images/editorial/${string}.webp`; width: number }>[];
  height: 864;
  imageSha256: string;
  provenance: Readonly<{ generator: string; cliSha256: string; job: string; prompt: string; promptSha256: string; receipt: string }>;
  src: `/images/editorial/${string}.webp`;
  title: string;
  width: 1536;
}>;

export const editorialImages = [
  {
    "alt": "Ivory ribbons, stepping stones, and an arch lead toward a small amber doorway.",
    "canonicalPath": "/compare/",
    "caption": "",
    "cardDescription": "Choose a reader, browser tool, or account integration based on the work the agent needs to do.",
    "cardTitle": "How agents reach the web",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "9f738d05ea9af35a6b713792fd45b271eacc9637cb5fff19855c67a1c50d2ec3",
        "src": "/images/editorial/how-agents-reach-the-web-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "9854f14527e3e3ae2dc634e03c85f86f69f70b3becf3bfec6665f1122feac03a",
        "src": "/images/editorial/how-agents-reach-the-web-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "f959955b59f1cd4865cd65e75cde962abb4ed95d4a4624245232b006a52dddb4",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/how-agents-reach-the-web/job.json",
      "prompt": "editorial-provenance/brand-series/how-agents-reach-the-web/prompt.txt",
      "promptSha256": "19c3998e7dd6f6b551ed00f14615de95c72814ff41c49387efd35d57006771e7",
      "receipt": "editorial-provenance/brand-series/how-agents-reach-the-web/receipt.json"
    },
    "src": "/images/editorial/how-agents-reach-the-web-paper.webp",
    "title": "How agents reach the web",
    "width": 1536
  },
  {
    "alt": "An ivory paper fan sits beside a single amber tab fitted into a matching recess.",
    "canonicalPath": "/compare/personal-agents-browser-use/",
    "caption": "",
    "cardDescription": "Choose tools by how much of the task is known before the agent starts.",
    "cardTitle": "Browser control or named actions",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "ff10e7152da213b475a96c2e98e6127073265bb4fb525981c043cac57a6f7756",
        "src": "/images/editorial/personal-agents-browser-use-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "93c9b8b7e801ce9a82fd78906dc9bb904cd7f10e1e6054a3a29ae928727b6d8f",
        "src": "/images/editorial/personal-agents-browser-use-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "d333963c073c171b0c7d7f9479bbb031de5c77aa05d567e3be81a911fe415e22",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/personal-agents-browser-use/job.json",
      "prompt": "editorial-provenance/brand-series/personal-agents-browser-use/prompt.txt",
      "promptSha256": "80478b24d6b23e433342591710fd0e50e83e2c17b1a0a55ba99bfcb7d3bc1ce0",
      "receipt": "editorial-provenance/brand-series/personal-agents-browser-use/receipt.json"
    },
    "src": "/images/editorial/personal-agents-browser-use-paper.webp",
    "title": "Browser control or named actions",
    "width": 1536
  },
  {
    "alt": "Two folded ivory forms have circular openings; amber light passes through one.",
    "canonicalPath": "/agentic-web-spoofing/",
    "caption": "",
    "cardDescription": "Separate a caller’s claimed name, verified identity, and permission to act.",
    "cardTitle": "How to verify a web agent’s identity",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "c572f7edbb78c2599b1ad1a988c21aac88019aabded36d0af5124752116d3d54",
        "src": "/images/editorial/agentic-web-spoofing-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "4ead503e9a2073656779339397774c56af23f1ff355d0463ad495ef0776e3bf6",
        "src": "/images/editorial/agentic-web-spoofing-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "98e8d514df2e7c365a5324e1da085c1f593e4fd7e7cb1bd2dd7789b89e6bb3e8",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/agentic-web-spoofing/job.json",
      "prompt": "editorial-provenance/brand-series/agentic-web-spoofing/prompt.txt",
      "promptSha256": "cb29f2af5565c1a1ade9d3e07cde2fc12f5384d70ae3bd7122e1dc7c8d19dd6d",
      "receipt": "editorial-provenance/brand-series/agentic-web-spoofing/receipt.json"
    },
    "src": "/images/editorial/agentic-web-spoofing-paper.webp",
    "title": "How to verify a web agent’s identity",
    "width": 1536
  },
  {
    "alt": "An amber thread crosses an open doorway in a small ivory paper room.",
    "canonicalPath": "/vms-cannot-contain-agents/",
    "caption": "",
    "cardDescription": "Understand the files, accounts, and connections an agent can reach beyond its environment.",
    "cardTitle": "What a virtual machine isolates",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "6d0cab958723b57e273543e3be974b7a2593bdc089d2ccf719c1580c971c9b05",
        "src": "/images/editorial/vms-cannot-contain-agents-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "7f810af7c4df6aaf684e268534566d0cdc9093d16dd8bd03895c45a6373a6957",
        "src": "/images/editorial/vms-cannot-contain-agents-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "16df7ad5e2354cf6426b9b30fd72e7d50e45f5afafdaa83c8a22177609c5d256",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/vms-cannot-contain-agents/job.json",
      "prompt": "editorial-provenance/brand-series/vms-cannot-contain-agents/prompt.txt",
      "promptSha256": "df5245fca299a765d19e7833b64ad6503179f0b16deb439df3292b20ad357cdf",
      "receipt": "editorial-provenance/brand-series/vms-cannot-contain-agents/receipt.json"
    },
    "src": "/images/editorial/vms-cannot-contain-agents-paper.webp",
    "title": "What a virtual machine isolates",
    "width": 1536
  },
  {
    "alt": "An amber branch connects three ivory socket tiles beside a fourth unconnected tile.",
    "canonicalPath": "/webmcp/",
    "caption": "",
    "cardDescription": "Discover a site’s tools, inspect their inputs, and make a supported read-only call.",
    "cardTitle": "The tools websites publish for agents",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "a38db105d9785e2bcb1a46a901ff3012c3e7d5125e68366399474861e20e001c",
        "src": "/images/editorial/webmcp-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "1bb53af82e747db6bd960ab0cd2271b8ad405281036a99f343a2165fc1c33090",
        "src": "/images/editorial/webmcp-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "10f1bd03fad2be9bc5807e640812a82df83bffd7733cef4b899ab507a2f62a63",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/webmcp/job.json",
      "prompt": "editorial-provenance/brand-series/webmcp/prompt.txt",
      "promptSha256": "7bcc5e8515ad47425d6fa71dc5dbd672d44af7506b78da6a7857be587d0d661b",
      "receipt": "editorial-provenance/brand-series/webmcp/receipt.json"
    },
    "src": "/images/editorial/webmcp-paper.webp",
    "title": "The tools websites publish for agents",
    "width": 1536
  },
  {
    "alt": "A folded ivory paper hand lowers an amber token into a shallow ivory tray.",
    "canonicalPath": "/blog/introducing-ghostget/",
    "caption": "",
    "cardDescription": "Read pages, connect accounts, and review consequential actions before they run.",
    "cardTitle": "Named web actions for your agent",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "ba58b66c69b704f18a2a33715cbdd7f43ddc3a9e5179fa67caa84ab7d64a098c",
        "src": "/images/editorial/introducing-ghostget-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "79b44247a0faaa1f1b53cbc7fcba074e80b39d37f2d51fbae62dee2147605e44",
        "src": "/images/editorial/introducing-ghostget-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "75ba88760cb79563ba838c9fd12eb574f6290b26603b917f877f41b38c3e1c08",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/introducing-ghostget/job.json",
      "prompt": "editorial-provenance/brand-series/introducing-ghostget/prompt.txt",
      "promptSha256": "25077a690d47122cda32c56a8a3a7bea1b24808d5ec65c6301122e1d27dc5891",
      "receipt": "editorial-provenance/brand-series/introducing-ghostget/receipt.json"
    },
    "src": "/images/editorial/introducing-ghostget-paper.webp",
    "title": "Named web actions for your agent",
    "width": 1536
  },
  {
    "alt": "An amber thread joins an ivory paper bowl, envelope, and shallow tray.",
    "canonicalPath": "/blog/built-on-ghostget/",
    "caption": "",
    "cardDescription": "Account reads, message exports, and page captures supply information for other tools.",
    "cardTitle": "How other tools use GhostGet",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "45ecde6518af153e77721b3c49dbe2395c6a9438e647627acf3822ce4cc15a15",
        "src": "/images/editorial/built-on-ghostget-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "d629f23c24f274b8361e3dfcd54b6b546837fd92c0b858cd85513e7ee694399a",
        "src": "/images/editorial/built-on-ghostget-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "c872147ae99fa5301e3e9fed30ed03a822f561cdfcecfb40da6128e9aede954f",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/built-on-ghostget/job.json",
      "prompt": "editorial-provenance/brand-series/built-on-ghostget/prompt.txt",
      "promptSha256": "ce1548caa8b552ba70bc1be97eb220a843533531c4ba954d950eb96d5654f601",
      "receipt": "editorial-provenance/brand-series/built-on-ghostget/receipt.json"
    },
    "src": "/images/editorial/built-on-ghostget-paper.webp",
    "title": "How other tools use GhostGet",
    "width": 1536
  },
  {
    "alt": "A magnifying lens reveals an amber-lit seam in three overlapping ivory paper records.",
    "canonicalPath": "/blog/ghostget-claims-register/",
    "caption": "",
    "cardDescription": "Check the result and understand idempotency before repeating a consequential request.",
    "cardTitle": "Why a failed send can still have succeeded",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "806b7bfc81187996f59e3e0c9abb46a4b5ce213c9b32c48c7185b28af3ded4e7",
        "src": "/images/editorial/ghostget-claims-register-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "d8570d8594ff61861e9557f0845e1f03f1a87eab883cacb64429c1f4f6be8a3e",
        "src": "/images/editorial/ghostget-claims-register-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "f370dd07f25c16db9fd9d11e6a5dc4b7cd8a737fbdb7a81c046ddadd90fda03f",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/ghostget-claims-register/job.json",
      "prompt": "editorial-provenance/brand-series/ghostget-claims-register/prompt.txt",
      "promptSha256": "f4b9ab6c60e0f3ba946fe7a261c1016691fe83cf389e0fec812526e92e290c35",
      "receipt": "editorial-provenance/brand-series/ghostget-claims-register/receipt.json"
    },
    "src": "/images/editorial/ghostget-claims-register-paper.webp",
    "title": "Why a failed send can still have succeeded",
    "width": 1536
  },
  {
    "alt": "An ivory paper parcel and its matching impression are joined by an amber thread.",
    "canonicalPath": "/blog/releases-that-prove-their-origin/",
    "caption": "",
    "cardDescription": "Match the file fingerprint and signed build record before installing a package.",
    "cardTitle": "How to verify where a download came from",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "e582f9b6ebf4fdfe37a8772ea6c5696ab7debf914ceb46c601d0120e539806bb",
        "src": "/images/editorial/releases-that-prove-their-origin-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "1a275b71d83bea57f3a08c2c6a6376a53cb0208b705d631a9be77c7312fd9b31",
        "src": "/images/editorial/releases-that-prove-their-origin-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "547fe376f7be3de1c1ac8199fd3375d95cee91d99e939113b050e779af1ebb38",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/releases-that-prove-their-origin/job.json",
      "prompt": "editorial-provenance/brand-series/releases-that-prove-their-origin/prompt.txt",
      "promptSha256": "40e72190e248e97892fb962ded3762fba0357d7669209597b1f4d6584ead6520",
      "receipt": "editorial-provenance/brand-series/releases-that-prove-their-origin/receipt.json"
    },
    "src": "/images/editorial/releases-that-prove-their-origin-paper.webp",
    "title": "How to verify where a download came from",
    "width": 1536
  },
  {
    "alt": "One amber fold interrupts an ivory paper strip and repeats in a separate small piece.",
    "canonicalPath": "/blog/replayable-property-tests/",
    "caption": "",
    "cardDescription": "Generate inputs from a rule and preserve the smallest failure as a regression.",
    "cardTitle": "Turn an unexpected input into a repeatable test",
    "credit": "Generated with SlopCamera.",
    "creditUrl": "https://slopcamera.com",
    "derivatives": [
      {
        "height": 216,
        "sha256": "7bb0d884662911f347142ff84d29303f654ba4f208032658c3e1deefcef3d2d0",
        "src": "/images/editorial/replayable-property-tests-paper-384.webp",
        "width": 384
      },
      {
        "height": 432,
        "sha256": "dcd19c09d807813a2f3c9154e3936e558d6028be865ffaaf19d27f03e64cea6b",
        "src": "/images/editorial/replayable-property-tests-paper-768.webp",
        "width": 768
      }
    ],
    "height": 864,
    "imageSha256": "3b3f8e55d30713ca1099ee860a5b544e190188648f29c4879f1d64e5c45d23f7",
    "provenance": {
      "generator": "@hraness/slopcamera source commit 7a2de2fe1a67ae74baf52b574c07ea98c5e6cfce",
      "cliSha256": "732e6afe087912e9c015b6bc3889733a5ecb74e4f5aeb9bd67940c1bd5962b5b",
      "job": "editorial-provenance/brand-series/replayable-property-tests/job.json",
      "prompt": "editorial-provenance/brand-series/replayable-property-tests/prompt.txt",
      "promptSha256": "f11cd25f23011c943fdd23cb5e1360aade7f056f70c40a33345c0a91e1f9bc24",
      "receipt": "editorial-provenance/brand-series/replayable-property-tests/receipt.json"
    },
    "src": "/images/editorial/replayable-property-tests-paper.webp",
    "title": "Turn an unexpected input into a repeatable test",
    "width": 1536
  }
] as const satisfies readonly EditorialImage[];

export type EditorialPath = (typeof editorialImages)[number]["canonicalPath"];

export const EDITORIAL_ARTICLE_IMAGE_SIZES =
  "(max-width: 31.25rem) calc(100vw - 2.5rem), (max-width: 63rem) 92vw, 58rem" as const;
export const EDITORIAL_CARD_IMAGE_SIZES =
  "(max-width: 31.25rem) calc(100vw - 2.5rem), (max-width: 45rem) 92vw, (max-width: 80rem) 46vw, (max-width: 100rem) calc(40rem - 4vw), 36rem" as const;

export function editorialImage(path: string): EditorialImage | undefined {
  return editorialImages.find((image) => image.canonicalPath === path);
}

export function editorialImageUrl(image: EditorialImage): string {
  return `https://ghostget.com${image.src}`;
}

export function editorialImageSrcSet(image: EditorialImage): string {
  return [
    ...image.derivatives.map((derivative) => `${derivative.src} ${derivative.width}w`),
    `${image.src} ${image.width}w`,
  ].join(", ");
}
