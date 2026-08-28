import { EmailsFrequencySchema } from "$lib/schemas/api.schemas";
import { sendScheduledAlertsAction } from "$lib/server/email/commands/sendScheduledAlerts";
import { type AlertFrequency } from "$lib/types/user.types";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
    req: NextRequest,
    context: { params: { frequency: AlertFrequency } }
): Promise<NextResponse> {
    const frequency = EmailsFrequencySchema.safeParse(context.params.frequency);
    if (!frequency.success) {
        return NextResponse.json({ ok: false, errorMessage: "Invalid frequency" });
    }
    const res = await sendScheduledAlertsAction(frequency.data);
    if (!res.success) {
        return NextResponse.json({ ok: false, errorMessage: res.errorMessage });
    }
    return NextResponse.json({ ok: true, message: res.data, now: new Date().toISOString() });
}
