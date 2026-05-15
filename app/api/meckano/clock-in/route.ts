import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MECKANO_SUBSCRIBER_EMAIL, isMeckanoSubscriberEmail } from '@/lib/meckano-access';
import { meckanoFetch } from '@/lib/meckano-fetch';
import { requireMeckanoSession } from '@/lib/meckano-route-auth';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await requireMeckanoSession(session);
    if ('error' in auth) return auth.error;
    const apiKey = auth.apiKey;

    const body = await request.json();
    const { action } = body;

    // 2. Fetch Meckano User ID (Step 1)
    const usersRes = await meckanoFetch('users', apiKey, { method: 'GET' });

    if (!usersRes.ok) {
      return NextResponse.json({ error: 'נכשל החיבור למערכת Meckano (Users API)' }, { status: usersRes.status });
    }

    const usersData = await usersRes.json();
    // Find the user by email
    const lookupEmail = isMeckanoSubscriberEmail(session?.user?.email)
      ? session!.user!.email!
      : MECKANO_SUBSCRIBER_EMAIL;
    const meckanoUser = usersData.data?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === lookupEmail.toLowerCase(),
    );

    if (!meckanoUser) {
      return NextResponse.json({ error: 'משתמש לא נמצא במערכת Meckano' }, { status: 404 });
    }

    const meckanoUserId = meckanoUser.id;

    // 3. Clock-In/Out Execution (Step 2)
    // Using the punch endpoint as defined in the previous step or documentation
    const punchRes = await meckanoFetch('punch', apiKey, {
      method: 'POST',
      body: JSON.stringify({
        userId: meckanoUserId,
        action: action === 'in' ? 'checkin' : 'checkout',
        date: new Date().toISOString()
      })
    });

    const punchData = await punchRes.json().catch(() => ({ status: 'error', message: 'תגובה לא תקינה ממקאנו' }));

    if (!punchRes.ok || punchData.status === 'error') {
      return NextResponse.json(
        { error: punchData.message || 'שגיאה בדיווח הנוכחות' },
        { status: punchRes.status || 400 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: action === 'in' ? 'כניסה דווחה בהצלחה ל-Meckano' : 'יציאה דווחה בהצלחה ל-Meckano',
      meckanoId: meckanoUserId
    });
  } catch (error: any) {
    console.error("Meckano Clock-in Error:", error);
    return NextResponse.json({ error: 'שגיאת שרת בחיבור למקאנו' }, { status: 500 });
  }
}
