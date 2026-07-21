import WorldChartClient from './WorldChartClient'
import { getWorldChartState } from '../worldChartActions'

export const metadata = { title: 'The World Chart' }

export default async function WorldChartPage() {
  const { points, claimed } = await getWorldChartState()
  return <WorldChartClient points={points} claimed={claimed} />
}
