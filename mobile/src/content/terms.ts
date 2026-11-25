// Terms text, copied from the prototype (prototype/index.html) so the app and the Word documents match.
// Section = [heading, clauses]; segment rows = [label, text]. Bump TERMS_VERSION with the API's platform_settings.

export type Section = [string, string[]];
export type Segment = [string, string, [string, string][]];

export const TERMS_VERSION = "v2 \u00b7 9 November 2026";
export const MEMBER_TERMS: Section[] = [
  [
    "1. About these terms",
    [
      "These terms are an agreement between you and FitCircle. They apply every time you use the app, join a challenge or stake money.",
      "By tapping \"I understand and accept\" you confirm you have read them and agree to follow them."
    ]
  ],
  [
    "2. Who can join",
    [
      "You must be 16 or older to create an account, and 18 or older to join any challenge with a stake.",
      "You may have one account only, linked to your own phone number. You must give your real name and date of birth.",
      "Keep your phone and SMS codes private. You are responsible for everything done from your account."
    ]
  ],
  [
    "3. Showing up and proof",
    [
      "Every session needs proof: a photo or short video taken and uploaded in the app on the same day (Nairobi time). Earlier days cannot be logged.",
      "One session counts per day per challenge. No proof means no credit.",
      "Your proof must be real, recent and of you. Members of your challenge can see it."
    ]
  ]
];
export const MEMBER_SEGMENTS: Segment[] = [
  [
    "peer",
    "Peer Groups",
    [
      [
        "You commit to",
        "The weekly session target your group sets (2 to 7 sessions a week), for the whole challenge."
      ],
      [
        "You're out when",
        "You miss 3 sessions in one week. In groups with a 2-a-week target, missing both sessions in a week puts you out. Removal is automatic."
      ],
      [
        "If you are out",
        "Your stake is forfeited: 60% goes to FitCircle and 40% is shared equally by the members who finish."
      ],
      [
        "If you finish",
        "You get your full stake back plus your share of the 40%."
      ],
      [
        "If you fall short",
        "If you stay in but miss your weekly target, you will not finish and your stake is forfeited at the end in the same way."
      ]
    ]
  ],
  [
    "fc",
    "FitCircle Challenges",
    [
      [
        "What they are",
        "Open challenges run by FitCircle. Anyone who meets the age rules can join until the challenge starts."
      ],
      [
        "You commit to",
        "The weekly session target FitCircle sets for the challenge, for its whole length. Everyone in a challenge stakes the same amount, set by FitCircle."
      ],
      [
        "You're out when",
        "You miss 3 sessions in one week. In challenges with a 2-a-week target, missing both sessions in a week puts you out. Removal is automatic."
      ],
      [
        "If you are out",
        "Your stake is forfeited: 60% goes to FitCircle and 40% is shared equally by the members who finish."
      ],
      [
        "If you finish",
        "You get your full stake back plus your share of the 40%."
      ]
    ]
  ],
  [
    "d75",
    "75 Hard and 75 Soft",
    [
      [
        "You commit to",
        "Every daily task you chose, every day, for 75 days, with proof each day."
      ],
      [
        "You're out when",
        "You miss 3 days in total. A day counts only when every task is ticked and proof is uploaded."
      ],
      [
        "If you are out",
        "FitCircle keeps 100% of your stake."
      ],
      [
        "If you finish",
        "You get your full stake back."
      ]
    ]
  ],
  [
    "coach",
    "Instructor Challenges",
    [
      [
        "You commit to",
        "The instructor's programme and weekly session target."
      ],
      [
        "You're out when",
        "You miss 3 sessions in one week. Removal is automatic."
      ],
      [
        "Your entry fee",
        "Entry fees are not refunded once the programme starts, whether you finish or not. If you are removed, 60% of your fee goes to FitCircle and 40% to the instructor."
      ],
      [
        "Safety",
        "Follow the instructor's plan within your own limits and tell them about any injury or condition before you start."
      ]
    ]
  ]
];
export const MEMBER_TERMS_2: Section[] = [
  [
    "5. Stakes and payments",
    [
      "Staking is optional. Stakes are KES 200, 500, 1,000, 2,000, 5,000 or 10,000, the same for everyone in a challenge.",
      "You pay by M-Pesa or card (Flutterwave) before the challenge starts. If you have not paid by the start, you are removed from it.",
      "You can leave before the start and get your money back in full. Once a challenge starts, stakes are locked: you cannot leave or withdraw.",
      "Stakes are not returned for illness, injury, travel or a lost phone.",
      "A payment that reaches us after the challenge has started is refunded automatically."
    ]
  ],
  [
    "6. Settlement and payouts",
    [
      "Challenges are settled automatically the night after they end. Payouts go to your M-Pesa number the day after settlement.",
      "M-Pesa pays whole shillings. Shares are rounded down to the shilling and the leftover goes to FitCircle.",
      "If nobody in a Peer Group or FitCircle Challenge finishes, FitCircle keeps the forfeited stakes.",
      "A challenge with a flag still under review is settled once the flag is decided."
    ]
  ],
  [
    "7. Sponsored jackpots",
    [
      "Each calendar month FitCircle runs one jackpot for the whole platform: a prize paid for by a sponsor, such as a day pass at a health or wellness venue. Jackpots are never paid from members' stakes or entry fees.",
      "Each jackpot has one winner: the member with the most counted sessions across all their challenges that month. If members are level, the longest streak that month wins. If they are still level, FitCircle picks the winner by a random draw and records the result.",
      "The ranking resets on the 1st of every month. Only sessions logged in that month count, and flagged sessions count only once a flag is cleared.",
      "To win, your account must be in good standing when the winner is chosen (not suspended or under review). The winner is chosen shortly after the month ends.",
      "The sponsor provides the prize. FitCircle shares the winner's name and phone number with the sponsor only so they can deliver it."
    ]
  ],
  [
    "8. Fair play",
    [
      "Anyone in a challenge can flag proof that looks fake. You cannot flag your own proof.",
      "Flags are reviewed by the instructor (Instructor Challenges) or the FitCircle team. If a flag is upheld, that session does not count.",
      "If 3 of your sessions have open flags at once, your account is placed under review and you cannot log until it is cleared.",
      "Faking proof, using someone else's proof or running more than one account leads to removal from the challenge, loss of your stake and suspension of your account."
    ]
  ],
  [
    "9. Health and safety",
    [
      "FitCircle is not medical advice. Check with a doctor before starting if you have any health condition, are pregnant or have not exercised for a while.",
      "Never train through pain, illness or injury to protect a stake. You take part at your own risk."
    ]
  ],
  [
    "10. Your data",
    [
      "We collect your name, phone number, date of birth, payment records and the proof you upload, to run challenges and pay you.",
      "Your proof is shown to the people in your challenge. We handle your data under Kenya's Data Protection Act, 2019, and you can ask to see or delete it.",
      "We send reminders at 06:30 and 19:00 while a challenge runs. Members can nudge you once a day if you have not logged."
    ]
  ],
  [
    "11. Changes and ending your account",
    [
      "We may update these terms. You will see the new version and must accept it before your next challenge. Rules never change during a challenge you are already in.",
      "We may suspend or close an account that breaks these terms. You can close your account at any time once you have no challenge running.",
      "These terms are governed by the laws of Kenya."
    ]
  ]
];
export const COACH_TERMS: Section[] = [
  [
    "1. About these terms",
    [
      "These terms apply to you as a FitCircle instructor, in addition to the Member Terms.",
      "By tapping \"I understand and accept\" you confirm you have read them and agree to follow them."
    ]
  ],
  [
    "2. Becoming verified",
    [
      "You must be 18 or older and hold a recognised fitness qualification.",
      "Before you can host, you upload a fitness certification, your national ID or passport and a 60-second demo video. The FitCircle team must approve all three.",
      "Everything you upload must be genuine and your own. FitCircle may withdraw verification at any time if it is not."
    ]
  ],
  [
    "3. Your relationship with FitCircle",
    [
      "You are an independent instructor, not a FitCircle employee. You decide how you coach, within these terms.",
      "You are responsible for your own taxes and for any registration your work requires."
    ]
  ]
];
export const COACH_SEGMENT: Segment = [
  "coach",
  "Your programmes and earnings",
  [
    [
      "Programmes",
      "Programmes run 1 to 12 weeks, with a weekly target of at least 2 sessions. You set the entry fee, number of places and description, and they must be accurate."
    ],
    [
      "Locked at the start",
      "Once a programme starts, its dates, target and fee cannot change."
    ],
    [
      "Members who finish",
      "You receive 65% of their entry fees. FitCircle keeps 35%."
    ],
    [
      "Members who are removed",
      "Members who miss 3 sessions in a week are removed automatically. You receive 40% of their entry fees and FitCircle keeps 60%."
    ],
    [
      "Getting paid",
      "Earnings are paid by M-Pesa to your payout number the day after the programme is settled, in whole shillings."
    ]
  ]
];
export const COACH_TERMS_2: Section[] = [
  [
    "5. Your duties",
    [
      "Post a clear plan for each training day and keep sessions safe and suitable for beginners as well as fitter members.",
      "Do not give medical advice. Tell members to see a doctor where needed.",
      "Review flagged proof in your programmes promptly and fairly. Settlement waits until every flag is decided."
    ]
  ],
  [
    "6. Conduct",
    [
      "Treat members with respect. Harassment, discrimination or inappropriate contact leads to removal.",
      "Do not take payments from FitCircle members outside the app for FitCircle programmes.",
      "Never approve proof you know is fake, or ask members to fake proof."
    ]
  ],
  [
    "7. Content and member data",
    [
      "You own the plans, videos and voice notes you create. You allow FitCircle to show them in the app and to use them to promote your programmes.",
      "Use members' details only to run your programme. Do not copy or share them."
    ]
  ],
  [
    "8. Insurance and liability",
    [
      "You are responsible for the safety of the training you plan. We strongly recommend you hold professional liability insurance."
    ]
  ],
  [
    "9. Suspension and changes",
    [
      "FitCircle may pause your programmes or remove your verification if you break these terms or receive upheld safety complaints. Members already paid in will be treated fairly.",
      "We may update these terms. You must accept the new version before your next programme starts. These terms are governed by the laws of Kenya."
    ]
  ]
];

export const MEMBER_KEY_POINTS = [
  'Log every session the same day, with real proof.',
  'Miss 3 sessions in a week (3 days in 75-day challenges) and you are out.',
  'Finish and you always get your full stake back.',
  'Stakes are locked once a challenge starts.',
  'One sponsored jackpot a month. The top performer wins; it resets on the 1st.',
];
export const COACH_KEY_POINTS = [
  'You must be verified before you can host.',
  'You earn 65% of fees from members who finish and 40% from members who are removed.',
  'Programmes are locked once they start.',
  'You review flags in your programmes fairly and promptly.',
];
