import {
  MERCHANT_POLICY_PAGE_IDS,
  type MerchantPolicyPage,
  type MerchantPolicyPageId,
} from './merchant-policy.shared';

export const merchantIdentity = {
  legalName: 'Elliot Richard Vaucher',
  legalForm: 'Swiss sole proprietor',
  address: {
    street: 'Avenue Virgile-Rossel 18',
    postalCode: '1012',
    city: 'Lausanne',
    country: 'Switzerland',
  },
} as const;

export function merchantContactEmail(env: AppEnv) {
  const email = env.STOREFRONT_CONTACT_EMAIL?.trim() || '';
  return isValidMerchantContactEmail(email) ? email : null;
}

export function isValidMerchantContactEmail(value: string | undefined) {
  const email = value?.trim() || '';
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !/(?:ritsl|self[-_.]?tech[-_.]?labs)/i.test(email)
  );
}

export const merchantPolicyPages = {
  shipping: {
    title: 'Shipping policy',
    summary:
      'This independently operated storefront accepts delivery addresses in Switzerland and the United States. Storefront prices and checkout charges are in Swiss francs (CHF).',
    sections: [
      {
        heading: 'Made-to-order production',
        paragraphs: [
          'Products are made to order after successful payment and a fulfillment review. Production usually takes 2–5 business days before the parcel is handed to the carrier.',
          'Production begins quickly, but an order may be held briefly while we check availability, the delivery details, or a payment or fulfillment issue.',
        ],
      },
      {
        heading: 'Delivery estimate and charges',
        paragraphs: [
          'Allow an estimated 7–15 business days from order confirmation to delivery in Switzerland or the United States. These timings are estimates, not guarantees, and can be affected by production demand, public holidays, carrier disruption, customs, or the destination.',
          'The shipping charge and any other non-optional charge are shown in checkout before payment. Tracking is provided when the fulfillment partner and carrier make it available.',
          'The seller is responsible for normal import, customs, and carrier-clearance charges required to deliver the parcel under the supported Switzerland or United States route. If a carrier asks you to pay an unexpected import or clearance charge, contact us before paying so we can investigate and arrange payment or reimbursement where appropriate.',
        ],
      },
      {
        heading: 'Delivery details and delays',
        paragraphs: [
          'Please provide a complete and accurate delivery address and review it before paying. Contact us as soon as possible if you notice an error; an address cannot always be changed after production or dispatch has begun.',
          'If a parcel is late, marked delivered but missing, visibly damaged, or returned to sender, email us with the order reference. Prompt notice helps us investigate with the fulfillment partner and carrier and does not reduce any mandatory consumer right.',
        ],
      },
      {
        heading: 'Where we deliver',
        paragraphs: [
          'The storefront currently serves delivery addresses in Switzerland and the United States only. An order with an unsupported destination may be cancelled and refunded rather than fulfilled.',
        ],
      },
    ],
  },
  returns: {
    title: 'Returns, refunds, and product issues',
    summary:
      'Swiss law does not provide a general change-of-mind cancellation right for online purchases. We nevertheless offer the voluntary return option below for eligible goods.',
    sections: [
      {
        heading: 'Voluntary 14-day returns',
        paragraphs: [
          'You may ask to return a non-personalized item within 14 calendar days after delivery if it is unused, unworn, unwashed, and in its original condition. Email us before sending anything back and include the order reference, the item, and the reason for the return.',
          'A return requires our prior authorization and the return instructions we provide. An authorized return must be dispatched within 14 calendar days after authorization. Do not send a return to the fulfillment partner or the seller address unless the instructions expressly tell you to do so.',
          'For a change-of-mind return, you pay the return postage and remain responsible for the parcel until it is received. After an eligible return is received and inspected, we refund the returned item price to the original payment method. Original outbound shipping and return postage are not refunded unless the item was defective, damaged, misprinted, or incorrect.',
        ],
      },
      {
        heading: 'Items outside the voluntary return option',
        paragraphs: [
          'Personalized or custom-made goods cannot be returned for a change of mind. An item that has been worn beyond trying it on, washed, altered, damaged after delivery, or returned without authorization may also be refused.',
          'These exclusions do not apply where an item is defective, damaged in transit, misprinted, or different from what was ordered, and they do not limit rights that cannot be excluded by law.',
        ],
      },
      {
        heading: 'Defective, damaged, misprinted, or incorrect items',
        paragraphs: [
          'Contact us promptly—ideally within 30 days after delivery—with the order reference, a description of the problem, and clear photographs. We will assess the issue and, when justified, arrange an appropriate remedy such as a replacement, repair, price reduction, or refund.',
          'If we require a faulty or incorrect item to be returned, we provide instructions and cover reasonable return postage. Please do not return it before receiving authorization.',
          'The voluntary process and preferred 30-day reporting window do not reduce the mandatory Swiss defect framework. Applicable statutory warranty periods, including the two-year framework for movable goods, and remedies remain unaffected.',
        ],
      },
      {
        heading: 'Refund timing',
        paragraphs: [
          'Approved refunds are submitted to the original payment method without undue delay after the return or claim is resolved. Stripe and the card issuer or bank may need additional time to display the credit.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy notice',
    summary:
      'Elliot Richard Vaucher is the controller responsible for personal data used to operate this shop. This notice explains what is processed, why it is needed, and who helps process it.',
    sections: [
      {
        heading: 'Data we process',
        paragraphs: [
          'Depending on how you use the shop, we process contact and delivery details, order contents, prices, currency, order and provider references, payment and fulfillment status, customer-service messages, and technical or security information such as request logs and IP addresses.',
          'Payment credentials are collected and handled by Stripe. We do not store full card details in the shop database. The shop database stores order records and product snapshots but does not retain the checkout delivery address. Your browser stores the cart and a limited set of completed-order references in local storage so the cart works and is not cleared twice.',
        ],
      },
      {
        heading: 'Why we process data',
        paragraphs: [
          'We use personal data to display and maintain the cart, take payment, confirm and fulfill an order, arrange delivery, provide support, handle returns and disputes, prevent abuse, secure the service, keep required business records, and comply with legal obligations.',
          'We process only the data reasonably needed for those purposes. Where applicable law requires consent for a particular use, we ask for it separately.',
        ],
      },
      {
        heading: 'Service providers and recipients',
        paragraphs: [
          'Stripe provides checkout and payment processing. Printful produces and dispatches goods and shares necessary delivery details with carriers. Vercel hosts the storefront, Neon/Postgres stores operational order records, and Inngest coordinates fulfillment events and retries.',
          'Each provider receives data needed for its role and may process technical, account, or transaction information under its own terms and privacy notice. We may also disclose information when required by law, to protect legal rights, or to professional advisers under appropriate duties of confidentiality.',
        ],
      },
      {
        heading: 'International processing',
        paragraphs: [
          'Some providers, their affiliates, fulfillment facilities, or carriers may process data outside Switzerland. Where required, we rely on an applicable legal transfer mechanism or contractual and organizational safeguards. Provider locations and subprocessors can change over time.',
          'The operator reviews the processor terms, data-processing terms, current subprocessor lists, relevant processing countries, and transfer safeguards for Stripe, Printful and its carriers, Vercel, Neon/Postgres, Inngest, and the support-email provider. You may request current transfer information using the contact details below.',
        ],
      },
      {
        heading: 'Security measures',
        paragraphs: [
          'We use measures appropriate to this shop such as HTTPS in transit, restricted production access, separate environment credentials, least-privilege provider tokens, signed webhook verification, limited operational logging, database access controls, dependency and deployment review, and documented incident and credential-rotation procedures. No internet service can guarantee absolute security.',
        ],
      },
      {
        heading: 'Retention and browser storage',
        paragraphs: [
          'Accounting records are retained for at least 10 years where Swiss bookkeeping law requires it. Other order, transaction, support, fulfillment, fraud-prevention, and security data is kept only as long as reasonably necessary for its purpose, applicable tax or claims periods, another legal duty, or a provider’s documented retention schedule.',
          'The cart and completed-order references stored in your browser remain until they are cleared by the shop logic, your browser settings, or you. The storefront does not currently use advertising trackers or marketing analytics. Stripe and other third-party services may use their own essential cookies or similar technologies when you use their pages.',
        ],
      },
      {
        heading: 'Your choices and rights',
        paragraphs: [
          'Subject to applicable law, you may ask whether we process your data and request access, correction, deletion, restriction, objection, or portability. Some data must be retained to complete an order, meet legal recordkeeping duties, establish or defend claims, or protect the service.',
          'Send a request to the contact email below. We may need to verify your identity before responding. You may also raise a concern with the Swiss Federal Data Protection and Information Commissioner.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of sale',
    summary:
      'These terms govern orders placed with Elliot Richard Vaucher through this independently operated storefront for delivery in Switzerland or the United States.',
    sections: [
      {
        heading: 'Seller and scope',
        paragraphs: [
          'The seller is Elliot Richard Vaucher, a Swiss sole proprietor. The seller identity and contact details appear below.',
          'The shop currently accepts orders for delivery in Switzerland or the United States and contracts only in Swiss francs (CHF). You must be able to enter into the purchase contract and provide accurate checkout information.',
        ],
      },
      {
        heading: 'Prices and payment',
        paragraphs: [
          'Consumer product prices are shown in CHF. The product price and every non-optional charge are disclosed before payment; shipping is itemized separately in checkout. Payment is processed securely by Stripe using the methods Stripe makes available for the transaction.',
        ],
      },
      {
        heading: 'Order steps and contract formation',
        paragraphs: [
          'Choose the product, variant, and quantity and review the cart. You can correct or remove cart items before continuing. In Stripe Checkout, enter the requested contact, delivery, and payment details and review the final total before using the final payment button, which places a paid order.',
          'The purchase contract is formed when payment succeeds and the order is confirmed. We provide or arrange an electronic order confirmation without undue delay using the email address supplied at checkout. Please retain the confirmation and public order reference.',
          'If the item is unavailable, the delivery details cannot be used, a material pricing error is evident, fulfillment would infringe third-party rights, or a payment or fraud check fails, we may decline or cancel the affected order. Any captured amount for a cancelled item is refunded to the original payment method.',
        ],
      },
      {
        heading: 'Products and fulfillment',
        paragraphs: [
          'Products are made to order. Images are illustrative: screen settings, print placement, and normal manufacturing tolerances can produce small differences in color, scale, or position. Size information should be reviewed before ordering.',
          'Production and delivery are governed by the Shipping policy. Ownership of the goods passes as provided by applicable law; mandatory rules about delivery and risk remain unaffected.',
        ],
      },
      {
        heading: 'Returns and defects',
        paragraphs: [
          'The voluntary return option and the process for defective, damaged, misprinted, lost, or incorrect items are in the Returns policy. Those rules do not exclude or reduce mandatory consumer remedies.',
        ],
      },
      {
        heading: 'Independent project and OpenAI rights',
        paragraphs: [
          'Codex Merch is an independent, fan-made project created for OpenAI Build Week. It is not an OpenAI product or official OpenAI merchandise and is not affiliated with, authorized, sponsored, approved, or endorsed by OpenAI. Participation in OpenAI Build Week did not create any partnership, agency, licence, or endorsement.',
          'OpenAI, Codex, and any OpenAI-owned names, marks, logos, images, product identifiers, or other brand assets remain the property of OpenAI. Elliot Vaucher and Codex Merch claim no ownership, licence, authorization, or other rights in those assets. A purchase transfers only the physical item and no intellectual-property right or licence.',
          'Upon OpenAI’s first notice or request through any reasonable contact channel, we will immediately suspend sale of the affected product, design, image, or reference and promptly remove it from the storefront; no cease-and-desist letter or further notice is required. If OpenAI instead specifically requests a modification, we will comply promptly. A paid but unfulfilled affected order may be cancelled and refunded. This commitment does not admit infringement and does not reduce any mandatory customer right.',
          'Other third-party names, marks, and materials remain the property of their respective owners. Storefront text, original artwork, photographs, and site materials may not be commercially reproduced without permission from the applicable rights holder.',
        ],
      },
      {
        heading: 'Liability',
        paragraphs: [
          'Nothing in these terms excludes or limits liability or consumer rights where doing so is prohibited, including mandatory product liability and liability for intentional or grossly negligent conduct. In all other respects, liability is determined under applicable Swiss law.',
        ],
      },
      {
        heading: 'Governing law and disputes',
        paragraphs: [
          'Swiss law governs these terms and orders, excluding conflict-of-laws rules to the extent permitted. The courts at Lausanne, Switzerland, have jurisdiction, subject always to any mandatory consumer right to bring or defend a claim in another competent venue.',
          'The policy version accepted when an order is placed applies to that order. If one provision is unenforceable, the remaining provisions continue to apply to the extent permitted.',
        ],
      },
    ],
  },
  contact: {
    title: 'Contact',
    summary:
      'Order support, return requests, privacy requests, and legal notices are handled directly by the independent shop operator.',
    sections: [
      {
        heading: 'Order and customer support',
        paragraphs: [
          'Use the contact email listed in the Terms of sale and include the public order reference for order-specific help. For a product issue, include a short description and clear photographs where relevant. Please request authorization before returning any item.',
        ],
      },
      {
        heading: 'Privacy and rights notices',
        paragraphs: [
          'Use the contact email listed in the Privacy notice for a data request. OpenAI or another rights holder may use the contact email in the Terms of sale for a removal or other legal notice.',
        ],
      },
    ],
  },
} as const satisfies Record<MerchantPolicyPageId, MerchantPolicyPage>;

export function isMerchantPolicyPageId(
  value: string | undefined,
): value is MerchantPolicyPageId {
  return (
    typeof value === 'string' &&
    (MERCHANT_POLICY_PAGE_IDS as readonly string[]).includes(value)
  );
}
