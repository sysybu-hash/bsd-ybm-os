import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MECKANO_SUBSCRIBER_EMAIL } from '@/lib/meckano-access';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;

    // 1. Strict Security (Email Validation)
    if (!userEmail || userEmail.toLowerCase() !== MECKANO_SUBSCRIBER_EMAIL.toLowerCase()) {
      return NextResponse.json(
        { error: 'אין לך הרשאה לדווח נוכחות במערכת זו' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action } = body;

    const apiKey = process.env.MECKANO_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Meckano API key is not configured' },
        { status: 500 }
      );
    }

    // 2. Fetch Meckano User ID (Step 1)
    const usersRes = await fetch('https://app.meckano.co.il/rest/users', {
      method: 'GET',
      headers: {
        'token': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!usersRes.ok) {
      return NextResponse.json({ error: 'נכשל החיבור למערכת Meckano (Users API)' }, { status: usersRes.status });
    }

    const usersData = await usersRes.json();
    // Find the user by email
    const meckanoUser = usersData.data?.find((u: any) => u.email?.toLowerCase() === MECKANO_SUBSCRIBER_EMAIL.toLowerCase());

    if (!meckanoUser) {
      return NextResponse.json({ error: 'משתמש לא נמצא במערכת Meckano' }, { status: 404 });
    }

    const meckanoUserId = meckanoUser.id;

    // 3. Clock-In/Out Execution (Step 2)
    // Using the punch endpoint as defined in the previous step or documentation
    const punchUrl = 'https://app.meckano.co.il/rest/punch';
    const punchRes = await fetch(punchUrl, {
      method: 'POST',
      headers: {
        'token': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
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
