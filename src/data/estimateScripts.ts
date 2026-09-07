export interface FollowUpScript {
 days: number;
 key: string;
 label: string;
 emailSubject: string;
 emailBody: string;
 smsBody: string;
}

export const ESTIMATE_FOLLOW_UP_SCRIPTS: Record<number, FollowUpScript> = {
 3: {
 days: 3,
 key: '3 day Follow UP',
 label: '3-Day Follow-Up (5% Discount Expires)',
 emailSubject: 'Last Chance to Save 5% on Your Estimate',
 emailBody: `Hi [Customer Name],

Just a quick reminder: today is the final day to save 5% on your estimate!

Your 3-day discount expires today. If you're ready to move forward, let us know, and we'll help you lock in your savings.

We’d love to get your project started!

Best,
[Your Name]`,
 smsBody: 'Hi [Customer Name]! Just a quick reminder: today is the last day to save 5% on your estimate! If you’re ready to move forward, let us know, and we’ll help you lock in your discount. We’d love to get your project started!',
 },
 7: {
 days: 7,
 key: '7 day Follow UP',
 label: '7-Day Follow-Up (Mid-Week Check-in)',
 emailSubject: 'Ready to Move Forward With Your Project?',
 emailBody: `Hi [Customer Name],

Still thinking about your project? Now may be a great time to move forward.

Your estimate was sent 7 days ago, and we may have a special discount available to help you get started.

Simply reply to this email, and we’ll be happy to discuss your options and next steps.

Best,
[Your Name]`,
 smsBody: 'Hi [Customer Name]! Still thinking about your project? It’s been 7 days since we sent your estimate, and we may have a special discount available to help you get started. Reply here if you’d like to learn more; we’d be happy to help!',
 },
 15: {
 days: 15,
 key: '15 day Follow UP',
 label: '15-Day Follow-Up (Bi-Weekly Review)',
 emailSubject: 'Still Thinking About Your Project?',
 emailBody: `Hi [Customer Name],

It’s been 15 days since we sent your estimate, and we wanted to check in — are you still considering moving forward with your project?

We may be able to offer you a special discount if you're ready to proceed.

Reply to this email or give us a call, and we’ll be happy to help you take the next step.

We’d love the opportunity to work with you!

Best,
[Your Name]`,
 smsBody: 'Hi [Customer Name]! It’s been 15 days since we sent your estimate, so we wanted to check in. If you’re still considering your project, we may have a special discount available to help you forward. Reply here or give us a call; we’d be happy to help!',
 },
 30: {
 days: 30,
 key: '30 day Follow UP',
 label: '30-Day Follow-Up (Monthly Check-in)',
 emailSubject: 'A Special Offer for Your Project',
 emailBody: `Hi [Customer Name],

We have something special for you!

It’s been 30 days since we sent your estimate, and we’d like to offer you an exclusive discount to help you move forward with your project.

This is a special offer, so simply reply to this email to claim your discount and learn more.

We’d love the opportunity to get your project started!

Best,
[Your Name]`,
 smsBody: 'Hi [Customer Name]! It’s been 30 days since we sent your estimate, and we have a special discount available for you. If you’re still interested in moving forward, just reply here to learn more and claim your offer. We’d love to help get your project started!',
 },
 90: {
 days: 90,
 key: 'Past 90 days Follow UP',
 label: 'Past 90 Days Follow-Up (Quarterly Revisit)',
 emailSubject: 'Let’s Revisit Your Project',
 emailBody: `Hi [Customer Name],

Still have that project on your list? We’d love to help you bring it back to life.

Since it’s been over 90 days since your original estimate, your project needs may have changed. We’d be happy to schedule a revisit and provide an updated estimate based on your needs today.

Simply reply to this email, and we’ll help you schedule the next step.

We’d love another opportunity to work with you!

Best,
[Your Name]`,
 smsBody: 'Hi [Customer Name]! Still have that project on your list? It’s been over 90 days since your original estimate, so your needs may have changed. We’d be happy to schedule a revisit or provide an updated estimate based on your current needs. Just reply here, and we’ll be happy to help!',
 },
};

export function getScriptForLead(daysElapsed: number): FollowUpScript {
 if (daysElapsed <= 4) return ESTIMATE_FOLLOW_UP_SCRIPTS[3];
 if (daysElapsed <= 11) return ESTIMATE_FOLLOW_UP_SCRIPTS[7];
 if (daysElapsed <= 22) return ESTIMATE_FOLLOW_UP_SCRIPTS[15];
 if (daysElapsed <= 60) return ESTIMATE_FOLLOW_UP_SCRIPTS[30];
 return ESTIMATE_FOLLOW_UP_SCRIPTS[90];
}
