'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Users } from 'lucide-react'
import { statisticsApi } from '@/lib/api/statistics-api'
import { destinationApi } from '@/lib/api/destination-api'
import { PROVINCES } from '@/services/data/constants'

// Mapping สำหรับรูปภาพของแต่ละจังหวัด (ใช้ province value)
// ใช้ชื่อไฟล์ตรงกับชื่อจังหวัด (province value) + '.jpg'
// ถ้าไม่มีรูปจริง จะ fallback ไปใช้ placeholder.svg ตาม logic ใน onError
const provinceImages: Record<string, string> = {
  // ภาคกลาง & ตะวันออก
  'bangkok': '/bangkok.jpg',
  'rayong': '/rayong.jpg',
  'trat': '/trat.jpg',
  'prachuap-khiri-khan': '/prachuap-khiri-khan.jpg',
  'chonburi': '/chonburi.jpg',
  'kanchanaburi': '/kanchanaburi.jpg',
  
  // ภาคเหนือ
  'chiang-mai': '/chiang-mai.jpg',
  'chiang-rai': '/chiang-rai.jpg',
  'lampang': '/lampang.jpg',
  'mae-hong-son': '/mae-hong-son.jpg',
  'nan': '/nan.jpg',
  'phrae': '/phrae.jpg',
  'phitsanulok': '/phitsanulok.jpg',
  'sukhothai': '/sukhothai.jpg',
  'tak': '/tak.jpg',
  
  // ภาคตะวันออกเฉียงเหนือ (อีสาน)
  'udon-thani': '/udon-thani.jpg',
  'khon-kaen': '/khon-kaen.jpg',
  'nakhon-ratchasima': '/nakhon-ratchasima.jpg',
  'ubon-ratchathani': '/ubon-ratchathani.jpg',
  'nakhon-phanom': '/nakhon-phanom.jpg',
  'sakon-nakhon': '/sakon-nakhon.jpg',
  'roi-et': '/roi-et.jpg',
  'loei': '/loei.jpg',
  'buri-ram': '/buri-ram.jpg',
  
  // ภาคใต้
  'phuket': '/phuket.jpg',
  'krabi': '/krabi.jpg',
  'songkhla': '/songkhla.jpg',
  'hat-yai': '/hat-yai.jpg',
  'surat-thani': '/surat-thani.jpg',
  'samui': '/samui.jpg',
  'nakhon-si-thammarat': '/nakhon-si-thammarat.jpg',
  'trang': '/trang.jpg',
  'ranong': '/ranong.jpg',
  'chumphon': '/chumphon.jpg',
  'narathiwat': '/narathiwat.jpg',
}

// Mock average prices - ใช้ราคาเบื้องต้นที่หลากหลายขึ้น
// หมายเหตุ: สามารถดึงจาก API ได้ในอนาคตด้วย statisticsApi.getPriceStatistics(origin, destination)
const mockAveragePrices: Record<string, number> = {
  // ภาคเหนือ
  'chiang-mai': 3500,
  'chiang-rai': 3800,
  'lampang': 3200,
  'mae-hong-son': 4000,
  'nan': 3300,
  'phrae': 3100,
  'phitsanulok': 2900,
  'sukhothai': 3000,
  'tak': 2800,
  
  // ภาคอีสาน
  'khon-kaen': 2800,
  'udon-thani': 2700,
  'nakhon-ratchasima': 2600,
  'ubon-ratchathani': 3100,
  'nakhon-phanom': 3200,
  'sakon-nakhon': 3000,
  'roi-et': 2900,
  'loei': 3100,
  'buri-ram': 2700,
  
  // ภาคใต้
  'phuket': 3200,
  'songkhla': 2500,
  'hat-yai': 2500,
  'krabi': 3000,
  'surat-thani': 2800,
  'samui': 4200,
  'nakhon-si-thammarat': 2400,
  'trang': 2600,
  'ranong': 2900,
  'chumphon': 2700,
  'narathiwat': 3300,
  
  // ภาคกลางและตะวันออก
  'bangkok': 2000, // เที่ยวในประเทศจากกรุงเทพ
  'chonburi': 1800,
  'rayong': 2200,
  'trat': 2500,
  'prachuap-khiri-khan': 2300,
  'kanchanaburi': 2100,
}

// Mock trends - ใช้ค่าเบื้องต้นที่หลากหลาย
const mockTrends: Record<string, string> = {
  'chiang-mai': '+15%',
  'chiang-rai': '+12%',
  'phuket': '+22%',
  'krabi': '+8%',
  'songkhla': '+18%',
  'hat-yai': '+18%',
  'khon-kaen': '+12%',
  'udon-thani': '+10%',
  'nakhon-ratchasima': '+9%',
  'rayong': '+5%',
  'trat': '+7%',
  'prachuap-khiri-khan': '+6%',
}

interface PopularDestinationDisplay {
  destination: string
  destinationName: string | null
  count: number
  provinceValue: string
  image: string
  avgPrice: string
  trend: string
  popular: boolean
}

export function PopularDestinations() {
  const [destinations, setDestinations] = useState<PopularDestinationDisplay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPopularDestinations = async () => {
      try {
        setLoading(true)
        const stats = await statisticsApi.getStatistics()
        
        // แปลงข้อมูลจาก API เป็นรูปแบบที่ต้องการ
        const destinationsDataPromises = stats.popularDestinations
          .slice(0, 4) // แสดงแค่ 4 อันดับแรก
          .map(async (dest, index) => {
            // หา province value จาก destination name หรือ destination value
            const province = PROVINCES.find(p => 
              p.label === dest.destination_name || 
              p.value === dest.destination ||
              dest.destination_name?.includes(p.label) ||
              p.label.includes(dest.destination_name || '')
            )
            
            const provinceValue = province?.value || dest.destination
            const displayName = dest.destination_name || province?.label || dest.destination
            
            // ดึงข้อมูลราคาและ trend จาก API (จากกรุงเทพไปยังปลายทางนั้นๆ)
            let avgPrice = mockAveragePrices[provinceValue]
            let trend = mockTrends[provinceValue] || '+10%'
            
            try {
              // ดึงราคาและ trend จาก API ถ้ามีข้อมูล (จากกรุงเทพไปยังปลายทาง)
              const priceStats = await statisticsApi.getPriceStatistics('bangkok', dest.destination)
              
              // ใช้ราคาจาก API ถ้ามี
              if (priceStats.averagePrice) {
                avgPrice = priceStats.averagePrice
              }
              
              // ใช้ trend จาก API ถ้ามี
              if (priceStats.priceTrend) {
                const { trend: trendType, percentage } = priceStats.priceTrend
                // แปลง trend เป็น string format เช่น '+15%', '-10%', '0%'
                if (trendType === 'up') {
                  trend = `+${percentage}%`
                } else if (trendType === 'down') {
                  trend = `-${percentage}%`
                } else {
                  trend = '0%' // stable
                }
              }
            } catch (priceError) {
              // ถ้า API error หรือไม่มีข้อมูล ให้ใช้ mock data
              console.debug(`No price/trend data for ${dest.destination}, using mock data`)
            }
            
            // ถ้ายังไม่มีราคา ให้ใช้ค่า default ตามระยะทางคร่าวๆ
            if (!avgPrice) {
              // ใช้ราคาเฉลี่ยตามภูมิภาค (ให้หลากหลายขึ้น)
              if (provinceValue.includes('chiang') || provinceValue.includes('mae')) {
                avgPrice = 3500 // ภาคเหนือ
              } else if (provinceValue.includes('phuket') || provinceValue.includes('krabi') || provinceValue.includes('samui')) {
                avgPrice = 3200 // ภาคใต้ (เที่ยวบินยอดนิยม)
              } else if (provinceValue.includes('rayong') || provinceValue.includes('trat') || provinceValue.includes('prachuap')) {
                avgPrice = 2200 // ภาคตะวันออก
              } else if (provinceValue.includes('khon') || provinceValue.includes('udon') || provinceValue.includes('nakhon-ratchasima')) {
                avgPrice = 2700 // ภาคอีสาน
              } else {
                avgPrice = 2800 // ค่า default ที่หลากหลายขึ้น
              }
            }
            
            return {
              destination: dest.destination,
              destinationName: displayName,
              count: dest.count,
              provinceValue,
              image: provinceImages[provinceValue] || '/placeholder.svg',
              avgPrice: `฿${Math.round(avgPrice).toLocaleString()}`,
              trend: trend,
              popular: index === 0, // แสดง badge "ยอดนิยม" สำหรับจังหวัดที่คนค้นหาเยอะสุดแค่อันเดียว
            }
          })
        
        const destinationsData = await Promise.all(destinationsDataPromises)
        setDestinations(destinationsData)
      } catch (error) {
        console.error('Error fetching popular destinations:', error)
        // Fallback to empty array on error
        setDestinations([])
      } finally {
        setLoading(false)
      }
    }

    fetchPopularDestinations()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">{'ปลายทางยอดนิยม'}</h2>
          <p className="text-muted-foreground">
            {'ดูว่าคนอื่นๆ กำลังค้นหาเที่ยวบินไปที่ไหนกัน'}
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-48 bg-muted animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (destinations.length === 0) {
    return (
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">{'ปลายทางยอดนิยม'}</h2>
          <p className="text-muted-foreground">
            {'ดูว่าคนอื่นๆ กำลังค้นหาเที่ยวบินไปที่ไหนกัน'}
          </p>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          ยังไม่มีข้อมูลการค้นหา
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">{'ปลายทางยอดนิยม'}</h2>
        <p className="text-muted-foreground">
          {'ดูว่าคนอื่นๆ กำลังค้นหาเที่ยวบินไปที่ไหนกัน'}
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {destinations.map((dest) => (
          <Card key={dest.destination} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer p-0">
            <div className="relative h-48 bg-muted rounded-t-xl">
              <img 
                src={dest.image || "/placeholder.svg"} 
                alt={dest.destinationName || dest.destination}
                className="w-full h-full object-cover rounded-t-xl"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.src = '/placeholder.svg'
                }}
              />
              {dest.popular && (
                <div className="absolute top-0 left-0 z-10">
                  <div 
                    className="bg-yellow-500 px-4 py-2"
                    style={{
                      borderTopLeftRadius: '0.5rem',
                      borderTopRightRadius: '0',
                      borderBottomLeftRadius: '0',
                      borderBottomRightRadius: '0.5rem',
                    }}
                  >
                    <span className="font-semibold text-sm" style={{ color: '#0055a4' }}>
                      {'ยอดนิยม'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 rounded-b-xl">
              <h3 className="font-bold text-lg mb-3">{dest.destinationName || dest.destination}</h3>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>{dest.count.toLocaleString()} {'ครั้ง'}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-sm ${
                    dest.trend.startsWith('-') 
                      ? 'text-red-600' 
                      : dest.trend.startsWith('+') 
                        ? 'text-green-600' 
                        : 'text-muted-foreground'
                  }`}>
                    {dest.trend.startsWith('-') ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : (
                      <TrendingUp className="w-4 h-4" />
                    )}
                    <span>{dest.trend}</span>
                  </div>
                </div>
                
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-1">{'ราคาเฉลี่ย'}</div>
                  <div className="text-xl font-bold text-primary">{dest.avgPrice}</div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
