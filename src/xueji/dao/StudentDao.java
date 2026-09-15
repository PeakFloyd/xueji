package xueji.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import xueji.db.DbUtil;
import xueji.entity.Student;

/**
 * 学生 数据访问对象(DAO)。
 */
public class StudentDao {

    /**
     * 查询所有学生（联表带出班名）。
     *
     * @return 学生列表
     */
    public List<Student> findAll() {
        List<Student> list = new ArrayList<>();
        String sql = "SELECT stu_id, stu_name, gender, class_id FROM student ORDER BY stu_id";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(mapRow(rs));
            }
        } catch (Exception e) {
            throw new RuntimeException("查询学生失败", e);
        }
        return list;
    }

    /**
     * 按学号查询学生。
     *
     * @param stuId 学号
     * @return 学生实体；不存在返回 null
     */
    public Student findById(String stuId) {
        String sql = "SELECT stu_id, stu_name, gender, class_id FROM student WHERE stu_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, stuId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return mapRow(rs);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("按学号查询失败", e);
        }
        return null;
    }

    /**
     * 新增学生。
     *
     * @param stu 学生实体
     * @return 影响行数
     */
    public int insert(Student stu) {
        String sql = "INSERT INTO student(stu_id, stu_name, gender, class_id) VALUES(?, ?, ?, ?)";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, stu.getStuId());
            ps.setString(2, stu.getStuName());
            ps.setString(3, stu.getGender());
            ps.setString(4, stu.getClassId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("新增学生失败（学号可能重复）", e);
        }
    }

    /**
     * 更新学生。
     *
     * @param stu 学生实体
     * @return 影响行数
     */
    public int update(Student stu) {
        String sql = "UPDATE student SET stu_name = ?, gender = ?, class_id = ? WHERE stu_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, stu.getStuName());
            ps.setString(2, stu.getGender());
            ps.setString(3, stu.getClassId());
            ps.setString(4, stu.getStuId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("更新学生失败", e);
        }
    }

    /**
     * 删除学生。
     *
     * @param stuId 学号
     * @return 影响行数
     */
    public int delete(String stuId) {
        String sql = "DELETE FROM student WHERE stu_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, stuId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("删除学生失败（可能仍有选课记录）", e);
        }
    }

    private Student mapRow(ResultSet rs) throws Exception {
        Student s = new Student();
        s.setStuId(rs.getString("stu_id"));
        s.setStuName(rs.getString("stu_name"));
        s.setGender(rs.getString("gender"));
        s.setClassId(rs.getString("class_id"));
        return s;
    }
}
