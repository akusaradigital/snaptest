import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validatedAxiosRequest } from '@/lib/outbound-url';

export async function POST(request: Request) {
  try {
    if (!(await auth())?.user?.email) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { aksora_url, aksora_key, title, issue_type, ...rest } = await request.json();

    if (!aksora_key) {
      return NextResponse.json({ detail: 'Aksora integration not configured. Go to Settings.' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ detail: 'Title is required' }, { status: 400 });
    }

    const baseUrl = (aksora_url || 'http://localhost:3000').replace(/\/$/, '');
    
    const rawType = (issue_type || '').trim().toLowerCase();
    const isTask = rawType.includes('task') || rawType.includes('improvement') || rawType.includes('feature');
    
    // Determine the module to use in Aksora (tasks or bugs)
    const moduleType = isTask ? 'tasks' : 'bugs';
    const destination = `${baseUrl}/api/public/v1/${moduleType}`;

    let payload: any = {};

    if (isTask) {
      payload = {
        title: title.replace(/\s+/g, ' ').trim().substring(0, 250),
        project: rest.project || 'SnapTest Default',
        relatedFeature: rest.related_feature || 'General',
        category: rawType.includes('feature') ? 'Feature' : (rawType.includes('improvement') ? 'Improvement' : 'Task'),
        status: 'todo',
        priority: rest.priority || 'P2',
        description: rest.description || title,
        acceptanceCriteria: Array.isArray(rest.acceptance_criteria) 
          ? rest.acceptance_criteria.join('\n') 
          : (rest.acceptance_criteria || 'N/A'),
        evidence: rest.evidence || '',
      };
    } else {
      payload = {
        project: rest.project || 'SnapTest Default',
        module: rest.module || 'General',
        bugType: 'Functional',
        title: title.replace(/\s+/g, ' ').trim().substring(0, 250),
        preconditions: 'None',
        stepsToReproduce: Array.isArray(rest.steps_to_reproduce) 
          ? rest.steps_to_reproduce.join('\n') 
          : (rest.steps_to_reproduce || 'N/A'),
        expectedResult: rest.expected_result || 'N/A',
        actualResult: rest.actual_result || rest.current_behavior || 'N/A',
        severity: rest.severity || 'medium',
        priority: rest.priority || 'P2',
        status: 'open',
        evidence: rest.evidence || '',
      };
    }

    const res = await validatedAxiosRequest(destination, {
      method: 'POST',
      data: payload,
      headers: {
        Authorization: `Bearer ${aksora_key.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    });

    if (res.status >= 400) throw new Error('Aksora API rejected the request');

    return NextResponse.json({
      success: true,
      message: `${moduleType === 'tasks' ? 'Task' : 'Bug'} successfully pushed to Aksora.`,
    });
  } catch (err: any) {
    console.error('Aksora create failed:', err);
    const detail = err.response?.data?.error || err.message || 'Failed to create record in Aksora';
    return NextResponse.json({ detail }, { status: 500 });
  }
}
