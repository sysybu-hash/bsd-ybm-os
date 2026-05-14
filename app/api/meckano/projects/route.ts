import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MECKANO_SUBSCRIBER_EMAIL } from '@/lib/meckano-access';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;

    // Security Check
    if (!userEmail || userEmail.toLowerCase() !== MECKANO_SUBSCRIBER_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: 'אין לך הרשאה לגשת לנתונים אלו' }, { status: 403 });
    }

    const apiKey = process.env.MECKANO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Meckano API Key is not configured' }, { status: 500 });
    }

    const response = await fetch('https://app.meckano.co.il/rest/tasks', {
      method: 'GET',
      headers: {
        'key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });

    const data = await response.json();
    
    if (!data.status) {
      return NextResponse.json({ error: data.message || 'Meckano API error', details: data }, { status: 400 });
    }

    // Map Meckano tasks to projects for the UI
    const projects = data.data.map((task: any) => ({
      id: task.id,
      name: task.description || task.comment || `Project ${task.id}`
    }));

    return NextResponse.json({ 
      success: true, 
      projects 
    });
  } catch (error: any) {
    console.error("Meckano Projects Error:", error);
    return NextResponse.json({ error: 'Failed to fetch Meckano projects', details: error.message }, { status: 500 });
  }
}
