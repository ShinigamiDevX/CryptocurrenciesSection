import { updateAlertsAction } from "$lib/server/alerts/commands/updateAlerts";
import { sendRealTimeAlertsAction } from "$lib/server/email/commands/sendRealtimeAlerts";
import { type NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(req: NextRequest): Promise<NextResponse> {
    const res1 = await updateAlertsAction();
    if (!res1.success) {
        return NextResponse.json({ ok: false, errorMessage: res1.errorMessage });
    }

    const createdAlerts = res1.data;

    const res2 = await sendRealTimeAlertsAction(createdAlerts);
    if (!res2.success) {
        return NextResponse.json({ ok: false, errorMessage: res2.errorMessage });
    }

    return NextResponse.json({ ok: true, message: res2.data, now: new Date().toISOString() });
}
