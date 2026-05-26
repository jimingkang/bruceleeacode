import numpy as np
from scipy.spatial.transform import Rotation as R

class GeometricallyExactBeamSolver:
    def __init__(self, L, num_elements, EA, EI, GJ):
        self.L = L
        self.ne = num_elements
        self.nn = num_elements + 1
        self.le = L / num_elements

        # 材料属性 (简化为各向同性对称截面)
        self.EA = EA
        self.EI = EI
        self.GJ = GJ

        # 初始构型：沿 X 轴分布 [3维坐标, 旋转向量(李代数)]
        self.x = np.zeros((self.nn, 3))
        self.x[:, 0] = np.linspace(0, L, self.nn)
        self.Theta = np.zeros((self.nn, 3)) # 初始旋转为 0

    def compute_element_forces_and_stiffness(self, n1, n2):
        """
        计算单个单元的残差力和切线刚度矩阵 (简化后的 Simo 形式)
        """
        x1, x2 = self.x[n1], self.x[n2]
        T1, T2 = self.Theta[n1], self.Theta[n2]

        # 1. 提取当前转动李群矩阵 \mathbf{\Lambda}
        R1 = R.from_rotvec(T1).as_matrix()
        R2 = R.from_rotvec(T2).as_matrix()
        R_mid = R.from_rotvec((T1 + T2) / 2).as_matrix() # 中点近似

        # 2. 计算变形度量 (拉伸与弯曲)
        u_prime = (x2 - x1) / self.le
        Gamma = R_mid.T @ u_prime - np.array([1, 0, 0]) # 减去初始轴向伸长(X向为1)

        # 旋转梯度 (弯曲与扭转度量)
        Omega = (T2 - T1) / self.le

        # 3. 构成内力项 (局部坐标系下)
        N = np.array([self.EA * Gamma[0], 0, 0]) # 简化：仅轴向力
        M = np.array([self.GJ * Omega[0], self.EI * Omega[1], self.EI * Omega[2]])

        # 4. 转换回全局坐标系 (拉回/推前 Pull-back / Push-forward)
        N_global = R_mid @ N
        M_global = R_mid @ M

        # 5. 构建简化的 12x12 单元残差力和材料刚度 + 几何刚度
        # 这里为了演示核心流程，使用非线性割线/割线近似简化构成
        f_int = np.zeros(12)
        f_int[0:3]   = -N_global
        f_int[3:6]   = -M_global + 0.5 * np.cross(x2-x1, N_global)
        f_int[6:9]   =  N_global
        f_int[9:12]  =  M_global + 0.5 * np.cross(x2-x1, N_global)

        # 切线刚度矩阵 K = K_mat + K_geo
        K_e = np.zeros((12, 12))
        # 填充主对角线线弹性与大变形耦合项 (此处为原理演示的骨架简化版)
        for i in range(3):
            K_e[i, i] = self.EA / self.le
            K_e[i+6, i+6] = self.EA / self.le
            K_e[i+3, i+3] = (self.EI if i>0 else self.GJ) / self.le
            K_e[i+9, i+9] = (self.EI if i>0 else self.GJ) / self.le

        # 几何刚度非对称修正 (李代数伴随算子的几何体现：追随力矩产生的非对称分量)
        f_mid_hat = np.array([[0, -M_global[2], M_global[1]],
                              [M_global[2], 0, -M_global[0]],
                              [-M_global[1], M_global[0], 0]])
        K_e[3:6, 3:6] += 0.5 * f_mid_hat
        K_e[9:12, 9:12] += 0.5 * f_mid_hat

        return f_int, K_e

    def solve_static(self, F_ext, max_iter=15, tol=1e-5):
        """
        完整的 Newton-Raphson 迭代求解器 (处理李群位姿更新)
        F_ext: 作用在末端节点的 6 维外载荷向量 [Fx, Fy, Fz, Mx, My, Mz]
        """
        history = [] # 记录迭代步用于 Manim 动画

        for k in range(max_iter):
            K_global = np.zeros((12 * self.ne, 12 * self.ne)) # 简化为总自由度空间
            K_global = np.zeros((6 * self.nn, 6 * self.nn))
            R_vector = np.zeros(6 * self.nn)

            # 组装有限元矩阵 (Assemble)
            for e in range(self.ne):
                n1, n2 = e, e + 1
                f_int_e, K_e = self.compute_element_forces_and_stiffness(n1, n2)

                # 映射到全局自由度
                idx = np.hstack([np.arange(6*n1, 6*n1+6), np.arange(6*n2, 6*n2+6)])
                for i in range(12):
                    R_vector[idx[i]] -= f_int_e[i]
                    for j in range(12):
                        K_global[idx[i], idx[j]] += K_e[i, j]

            # 施加末端外载荷
            R_vector[-6:] += F_ext

            # 施加左端固支边界条件 (BCs: 消除前6个自由度)
            K_bc = K_global[6:, 6:]
            R_bc = R_vector[6:]

            # 计算收敛残差
            norm_R = np.linalg.norm(R_bc)
            history.append((self.x.copy(), self.Theta.copy(), norm_R))
            if norm_R < tol:
                print(f"Convergence achieved at iteration {k}, Residual: {norm_R:.2e}")
                break

            # 求解线性方程组得到位移增量与李代数旋转增量
            delta_U = np.linalg.solve(K_bc, R_bc)

            # 更新状态 (全节点，跳过固支端)
            for n in range(1, self.nn):
                d_u = delta_U[6*(n-1) : 6*(n-1)+3]
                d_theta = delta_U[6*(n-1)+3 : 6*(n-1)+6]

                # 1. 位置标准加法更新
                self.x[n] += d_u

                # 2. 旋转的李群指数映射更新 (Rodrigues)
                R_curr = R.from_rotvec(self.Theta[n]).as_matrix()
                R_inc = R.from_rotvec(d_theta).as_matrix()
                R_new = R_inc @ R_curr # 非线性右乘/左乘复合
                self.Theta[n] = R.from_matrix(R_new).as_rotvec()

        return history
