import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">sleepdefeater</h1>
        <p className="text-gray-600 mb-8">
          Webcam-based attention and drowsiness detection
        </p>
        <Link
          href="/attention-demo"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-block"
        >
          Launch Attention Demo
        </Link>
      </div>
    </div>
  );
}
